import { Decimal } from "@growx/money";
import { createPublicId } from "@growx/ids";
import {
  allocateCreditLots,
  calculateBalanceFromLedger,
  verifyBalanceIntegrity,
} from "@growx/credits";
import type {
  ApplyAdjustmentParams,
  AuthorizeBillingParams,
  BillingAuthorizationRecord,
  BillingAuthorizationResult,
  CreditLot,
  CreditReservation,
  GrantCreditsParams,
  ICreditRepository,
  RefundCreditsParams,
  ReleaseReservationParams,
  ReservationAllocation,
  SettlementResult,
  SettlementShortfallRecord,
  SettleReservationParams,
  Wallet,
  WalletAdjustmentRecord,
  WalletBalance,
  WalletLedgerEntry,
  WorkspaceBudget,
} from "../domain/types.js";

export class CreditService {
  constructor(
    private readonly repository: ICreditRepository,
    private readonly idGenerator: (prefix: string) => string = (p) =>
      createPublicId(p as any) ||
      `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ) {}

  /**
   * Retrieves an existing organization wallet or creates a new one with zero initial balance.
   */
  async getOrCreateWallet(
    organizationId: string,
    currency: string = "USD",
    repo: ICreditRepository = this.repository,
  ): Promise<Wallet> {
    const existing = await repo.getWalletByOrganization(
      organizationId,
      currency,
    );
    if (existing) {
      return existing;
    }

    const now = new Date();
    const walletId = this.idGenerator("wal");
    const wallet: Wallet = {
      id: walletId,
      organizationId,
      currency,
      status: "active",
      creditLimit: Decimal.ZERO,
      allowNegative: false,
      createdAt: now,
      updatedAt: now,
    };

    const created = await repo.createWallet(wallet);

    const initialBalance: WalletBalance = {
      walletId,
      available: Decimal.ZERO,
      reserved: Decimal.ZERO,
      total: Decimal.ZERO,
      version: 1,
      updatedAt: now,
    };

    await repo.saveWalletBalance(initialBalance);
    return created;
  }

  /**
   * Gets the materialized wallet balance.
   */
  async getWalletBalance(
    walletId: string,
    repo: ICreditRepository = this.repository,
  ): Promise<WalletBalance> {
    const b = await repo.getWalletBalance(walletId);
    if (!b) {
      const now = new Date();
      return {
        walletId,
        available: Decimal.ZERO,
        reserved: Decimal.ZERO,
        total: Decimal.ZERO,
        version: 1,
        updatedAt: now,
      };
    }
    return b;
  }

  /**
   * Grants credits to an organization's wallet.
   */
  async grantCredits(params: GrantCreditsParams): Promise<{
    lot: CreditLot;
    ledgerEntry: WalletLedgerEntry;
    balance: WalletBalance;
  }> {
    const amount = Decimal.from(params.amount);
    if (amount.lte(Decimal.ZERO)) {
      throw new Error("Credit grant amount must be positive");
    }

    const currency = params.currency ?? "USD";

    return this.repository.withTransaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(
        params.organizationId,
        currency,
        tx,
      );
      if (wallet.status === "closed") {
        throw new Error(`Cannot grant credits to closed wallet ${wallet.id}`);
      }

      // Check idempotency
      if (params.idempotencyKey) {
        const existingEntry = await tx.getLedgerEntryByIdempotencyKey(
          wallet.id,
          params.idempotencyKey,
        );
        if (existingEntry) {
          const lot = await tx.getCreditLotById(existingEntry.referenceId);
          const balance = (await tx.getWalletBalance(wallet.id))!;
          if (lot) {
            return { lot, ledgerEntry: existingEntry, balance };
          }
        }
      }

      const now = new Date();
      const lotId = this.idGenerator("lot");
      const lot: CreditLot = {
        id: lotId,
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        lotType: params.lotType ?? "purchased",
        currency,
        originalAmount: amount,
        remainingAmount: amount,
        reservedAmount: Decimal.ZERO,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        grantedAt: now,
        expiresAt: params.expiresAt ?? null,
        createdAt: now,
      };

      await tx.saveCreditLot(lot);

      const currentBalance = (await tx.getWalletBalance(wallet.id)) ?? {
        walletId: wallet.id,
        available: Decimal.ZERO,
        reserved: Decimal.ZERO,
        total: Decimal.ZERO,
        version: 0,
        updatedAt: now,
      };

      const newAvailable = currentBalance.available.add(amount);
      const newTotal = currentBalance.total.add(amount);
      const newBalance: WalletBalance = {
        walletId: wallet.id,
        available: newAvailable,
        reserved: currentBalance.reserved,
        total: newTotal,
        version: currentBalance.version + 1,
        updatedAt: now,
      };

      await tx.saveWalletBalance(newBalance);

      const sequence = BigInt(newBalance.version);
      const ledgerEntryId = this.idGenerator("led");
      const ledgerEntry: WalletLedgerEntry = {
        id: ledgerEntryId,
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        currency,
        sequence,
        entryType: "credit_grant",
        amount,
        direction: "credit",
        referenceType: "grant",
        referenceId: lotId,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: {
          available: newAvailable,
          reserved: currentBalance.reserved,
          total: newTotal,
        },
        metadata: params.metadata,
        createdAt: now,
      };

      await tx.appendLedgerEntry(ledgerEntry);

      return { lot, ledgerEntry, balance: newBalance };
    });
  }

  /**
   * Pre-authorizes and reserves credits before gateway execution.
   */
  async authorizeBilling(
    params: AuthorizeBillingParams,
  ): Promise<BillingAuthorizationResult> {
    const estimatedPrice = Decimal.from(params.estimatedPrice);
    const currency = params.currency ?? "USD";
    const now = new Date();

    return this.repository.withTransaction(async (tx) => {
      // 1. Idempotency Check
      const existingRes = await tx.getReservationByRequestId(params.requestId);
      if (existingRes) {
        return {
          authorized:
            existingRes.status === "active" || existingRes.status === "settled",
          decision: "AUTHORIZED",
          reservationId: existingRes.id,
          estimatedPrice: existingRes.estimatedAmount,
          reservedAmount: existingRes.reservedAmount,
          currency: existingRes.currency,
        };
      }

      const wallet = await this.getOrCreateWallet(
        params.organizationId,
        currency,
        tx,
      );

      // 2. Check Wallet Status
      if (wallet.status !== "active") {
        const record: BillingAuthorizationRecord = {
          id: this.idGenerator("auth"),
          requestId: params.requestId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          walletId: wallet.id,
          decision: "WALLET_FROZEN",
          reason: `Wallet status is ${wallet.status}`,
          estimatedPrice,
          requiredReservation: estimatedPrice,
          currency,
          pricingPolicyVersion: params.pricingPolicyVersion,
          createdAt: now,
        };
        await tx.saveBillingAuthorizationRecord(record);
        return {
          authorized: false,
          decision: "WALLET_FROZEN",
          estimatedPrice,
          reservedAmount: Decimal.ZERO,
          currency,
          reason: record.reason,
        };
      }

      // 3. Check Workspace Budget
      const budget = await tx.getWorkspaceBudget(params.workspaceId, "monthly");
      if (budget && budget.enabled) {
        const potentialSpend = budget.spentInPeriod
          .add(budget.reservedInPeriod)
          .add(estimatedPrice);
        if (potentialSpend.gt(budget.hardLimit)) {
          const record: BillingAuthorizationRecord = {
            id: this.idGenerator("auth"),
            requestId: params.requestId,
            organizationId: params.organizationId,
            workspaceId: params.workspaceId,
            walletId: wallet.id,
            decision: "BUDGET_EXCEEDED",
            reason: `Workspace budget hard limit of ${budget.hardLimit.toString()} ${budget.currency} exceeded`,
            estimatedPrice,
            requiredReservation: estimatedPrice,
            currency,
            pricingPolicyVersion: params.pricingPolicyVersion,
            createdAt: now,
          };
          await tx.saveBillingAuthorizationRecord(record);
          return {
            authorized: false,
            decision: "BUDGET_EXCEEDED",
            estimatedPrice,
            reservedAmount: Decimal.ZERO,
            currency,
            reason: record.reason,
          };
        }
      }

      // 4. Handle Free Request ($0 estimated price)
      if (estimatedPrice.isZero()) {
        const record: BillingAuthorizationRecord = {
          id: this.idGenerator("auth"),
          requestId: params.requestId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          walletId: wallet.id,
          decision: "AUTHORIZED",
          reason: "Zero cost request authorized without reservation",
          estimatedPrice: Decimal.ZERO,
          requiredReservation: Decimal.ZERO,
          availableAtDecision:
            (await tx.getWalletBalance(wallet.id))?.available ?? Decimal.ZERO,
          currency,
          pricingPolicyVersion: params.pricingPolicyVersion,
          createdAt: now,
        };
        await tx.saveBillingAuthorizationRecord(record);
        return {
          authorized: true,
          decision: "AUTHORIZED",
          estimatedPrice: Decimal.ZERO,
          reservedAmount: Decimal.ZERO,
          currency,
        };
      }

      // 5. Check Available Balance
      const currentBalance = (await tx.getWalletBalance(wallet.id)) ?? {
        walletId: wallet.id,
        available: Decimal.ZERO,
        reserved: Decimal.ZERO,
        total: Decimal.ZERO,
        version: 0,
        updatedAt: now,
      };

      const maxSpendable = currentBalance.available.add(wallet.creditLimit);
      if (maxSpendable.lt(estimatedPrice) && !wallet.allowNegative) {
        const record: BillingAuthorizationRecord = {
          id: this.idGenerator("auth"),
          requestId: params.requestId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          walletId: wallet.id,
          decision: "INSUFFICIENT_CREDITS",
          reason: `Insufficient credits: required ${estimatedPrice.toString()}, available ${currentBalance.available.toString()}`,
          estimatedPrice,
          requiredReservation: estimatedPrice,
          availableAtDecision: currentBalance.available,
          currency,
          pricingPolicyVersion: params.pricingPolicyVersion,
          createdAt: now,
        };
        await tx.saveBillingAuthorizationRecord(record);
        return {
          authorized: false,
          decision: "INSUFFICIENT_CREDITS",
          estimatedPrice,
          reservedAmount: Decimal.ZERO,
          currency,
          reason: record.reason,
          availableBalance: currentBalance.available,
        };
      }

      // 6. Allocate Credit Lots
      const activeLots = await tx.getActiveCreditLots(wallet.id);
      const reservationId = this.idGenerator("res");
      const allocationResult = allocateCreditLots(
        activeLots,
        estimatedPrice,
        reservationId,
        now,
      );

      await tx.saveCreditLots(allocationResult.updatedLots);
      await tx.saveReservationAllocations(allocationResult.allocations);

      // 7. Create Reservation Record
      const ttlMs = (params.reservationTtlSeconds ?? 300) * 1000;
      const reservation: CreditReservation = {
        id: reservationId,
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        workspaceId: params.workspaceId,
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        currency,
        estimatedAmount: estimatedPrice,
        reservedAmount: estimatedPrice,
        status: "active",
        allocations: allocationResult.allocations,
        pricingPolicyId: params.pricingPolicyId,
        pricingPolicyVersion: params.pricingPolicyVersion,
        idempotencyKey: params.idempotencyKey,
        expiresAt: new Date(now.getTime() + ttlMs),
        createdAt: now,
      };

      await tx.saveReservation(reservation);

      // 8. Update Materialized Balance
      const newAvailable = currentBalance.available.sub(estimatedPrice);
      const newReserved = currentBalance.reserved.add(estimatedPrice);
      const newBalance: WalletBalance = {
        walletId: wallet.id,
        available: newAvailable.lt(Decimal.ZERO) ? Decimal.ZERO : newAvailable,
        reserved: newReserved,
        total: currentBalance.total,
        version: currentBalance.version + 1,
        updatedAt: now,
      };

      await tx.saveWalletBalance(newBalance);

      // 9. Update Budget Reserved Amount
      if (budget && budget.enabled) {
        budget.reservedInPeriod = budget.reservedInPeriod.add(estimatedPrice);
        budget.updatedAt = now;
        await tx.saveWorkspaceBudget(budget);
      }

      // 10. Append Reservation Ledger Entry
      const sequence = BigInt(newBalance.version);
      const ledgerEntry: WalletLedgerEntry = {
        id: this.idGenerator("led"),
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        currency,
        sequence,
        entryType: "reservation",
        amount: estimatedPrice,
        direction: "debit",
        referenceType: "reservation",
        referenceId: reservationId,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: {
          available: newBalance.available,
          reserved: newBalance.reserved,
          total: newBalance.total,
        },
        metadata: { requestId: params.requestId },
        createdAt: now,
      };

      await tx.appendLedgerEntry(ledgerEntry);

      // 11. Record Billing Authorization Approval
      const authRecord: BillingAuthorizationRecord = {
        id: this.idGenerator("auth"),
        requestId: params.requestId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        walletId: wallet.id,
        reservationId,
        decision: "AUTHORIZED",
        estimatedPrice,
        requiredReservation: estimatedPrice,
        availableAtDecision: currentBalance.available,
        currency,
        pricingPolicyVersion: params.pricingPolicyVersion,
        createdAt: now,
      };
      await tx.saveBillingAuthorizationRecord(authRecord);

      return {
        authorized: true,
        decision: "AUTHORIZED",
        reservationId,
        estimatedPrice,
        reservedAmount: estimatedPrice,
        currency,
        availableBalance: newBalance.available,
      };
    });
  }

  /**
   * Settles a credit reservation after gateway execution with final customer cost.
   */
  async settleReservation(
    params: SettleReservationParams,
  ): Promise<SettlementResult> {
    const finalPrice = Decimal.from(params.finalCustomerPrice);
    const now = new Date();

    return this.repository.withTransaction(async (tx) => {
      const reservation = await tx.getReservationById(params.reservationId);
      if (!reservation) {
        throw new Error(`Reservation not found: ${params.reservationId}`);
      }

      if (reservation.status === "settled") {
        return {
          status: "settled",
          consumedAmount: finalPrice,
          releasedAmount: Decimal.ZERO,
          overageAmount: Decimal.ZERO,
          shortfallAmount: Decimal.ZERO,
          reservation,
        };
      }

      const reservedAmount = reservation.reservedAmount;
      const wallet = (await tx.getWalletById(reservation.walletId))!;
      const currentBalance = (await tx.getWalletBalance(wallet.id))!;
      const allocations = await tx.getReservationAllocations(reservation.id);

      let consumedAmount = Decimal.ZERO;
      let releasedAmount = Decimal.ZERO;
      let overageAmount = Decimal.ZERO;
      let shortfallAmount = Decimal.ZERO;
      let status: "settled" | "shortfall" = "settled";

      if (finalPrice.lte(reservedAmount)) {
        // Normal settlement: consume actual usage, release remainder
        consumedAmount = finalPrice;
        releasedAmount = reservedAmount.sub(finalPrice);

        let remainingToConsume = consumedAmount;

        for (const alloc of allocations) {
          const lot = await tx.getCreditLotById(alloc.creditLotId);
          if (!lot) continue;

          const allocAmount = alloc.allocatedAmount;
          const lotConsume = allocAmount.lt(remainingToConsume)
            ? allocAmount
            : remainingToConsume;
          const lotRelease = allocAmount.sub(lotConsume);

          alloc.consumedAmount = lotConsume;
          alloc.releasedAmount = lotRelease;

          lot.reservedAmount = lot.reservedAmount.sub(allocAmount);
          lot.remainingAmount = lot.remainingAmount.sub(lotConsume);
          await tx.saveCreditLot(lot);

          remainingToConsume = remainingToConsume.sub(lotConsume);
        }

        await tx.saveReservationAllocations(allocations);

        // Update Balance
        const newReserved = currentBalance.reserved.sub(reservedAmount);
        const newTotal = currentBalance.total.sub(consumedAmount);
        const newAvailable = currentBalance.available.add(releasedAmount);

        const newBalance: WalletBalance = {
          walletId: wallet.id,
          available: newAvailable,
          reserved: newReserved.lt(Decimal.ZERO) ? Decimal.ZERO : newReserved,
          total: newTotal.lt(Decimal.ZERO) ? Decimal.ZERO : newTotal,
          version: currentBalance.version + 1,
          updatedAt: now,
        };

        await tx.saveWalletBalance(newBalance);

        // Update Workspace Budget
        const budget = await tx.getWorkspaceBudget(
          reservation.workspaceId,
          "monthly",
        );
        if (budget && budget.enabled) {
          budget.reservedInPeriod = budget.reservedInPeriod.sub(reservedAmount);
          budget.spentInPeriod = budget.spentInPeriod.add(consumedAmount);
          budget.updatedAt = now;
          await tx.saveWorkspaceBudget(budget);
        }

        // Ledger Entry for Consumption
        if (consumedAmount.gt(Decimal.ZERO)) {
          const seq = BigInt(newBalance.version);
          await tx.appendLedgerEntry({
            id: this.idGenerator("led"),
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            currency: reservation.currency,
            sequence: seq,
            entryType: "usage_settlement",
            amount: consumedAmount,
            direction: "debit",
            referenceType: "settlement",
            referenceId: reservation.id,
            idempotencyKey: params.idempotencyKey,
            balanceAfter: {
              available: newBalance.available,
              reserved: newBalance.reserved,
              total: newBalance.total,
            },
            metadata: { requestId: reservation.requestId },
            createdAt: now,
          });
        }

        // Ledger Entry for Release
        if (releasedAmount.gt(Decimal.ZERO)) {
          const seq = BigInt(newBalance.version + 1);
          newBalance.version += 1;
          await tx.appendLedgerEntry({
            id: this.idGenerator("led"),
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            currency: reservation.currency,
            sequence: seq,
            entryType: "reservation_release",
            amount: releasedAmount,
            direction: "credit",
            referenceType: "settlement",
            referenceId: reservation.id,
            balanceAfter: {
              available: newBalance.available,
              reserved: newBalance.reserved,
              total: newBalance.total,
            },
            metadata: { requestId: reservation.requestId },
            createdAt: now,
          });
        }
      } else {
        // Usage exceeded reservation: consume full reservation + attempt overage debit
        consumedAmount = reservedAmount;
        const extraNeeded = finalPrice.sub(reservedAmount);

        // Consume all allocated lots
        for (const alloc of allocations) {
          const lot = await tx.getCreditLotById(alloc.creditLotId);
          if (!lot) continue;

          alloc.consumedAmount = alloc.allocatedAmount;
          alloc.releasedAmount = Decimal.ZERO;

          lot.reservedAmount = lot.reservedAmount.sub(alloc.allocatedAmount);
          lot.remainingAmount = lot.remainingAmount.sub(alloc.allocatedAmount);
          await tx.saveCreditLot(lot);
        }

        await tx.saveReservationAllocations(allocations);

        if (currentBalance.available.gte(extraNeeded)) {
          // Overage covered by available balance
          overageAmount = extraNeeded;
          consumedAmount = finalPrice;

          const newReserved = currentBalance.reserved.sub(reservedAmount);
          const newAvailable = currentBalance.available.sub(extraNeeded);
          const newTotal = currentBalance.total.sub(finalPrice);

          const newBalance: WalletBalance = {
            walletId: wallet.id,
            available: newAvailable,
            reserved: newReserved.lt(Decimal.ZERO) ? Decimal.ZERO : newReserved,
            total: newTotal.lt(Decimal.ZERO) ? Decimal.ZERO : newTotal,
            version: currentBalance.version + 1,
            updatedAt: now,
          };
          await tx.saveWalletBalance(newBalance);

          // Append usage settlement for full amount
          await tx.appendLedgerEntry({
            id: this.idGenerator("led"),
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            currency: reservation.currency,
            sequence: BigInt(newBalance.version),
            entryType: "usage_settlement",
            amount: finalPrice,
            direction: "debit",
            referenceType: "settlement",
            referenceId: reservation.id,
            idempotencyKey: params.idempotencyKey,
            balanceAfter: {
              available: newBalance.available,
              reserved: newBalance.reserved,
              total: newBalance.total,
            },
            metadata: {
              requestId: reservation.requestId,
              overage: overageAmount.toString(),
            },
            createdAt: now,
          });
        } else {
          // Shortfall!
          shortfallAmount = extraNeeded;
          status = "shortfall";

          const newReserved = currentBalance.reserved.sub(reservedAmount);
          const newTotal = currentBalance.total.sub(reservedAmount);

          const newBalance: WalletBalance = {
            walletId: wallet.id,
            available: currentBalance.available,
            reserved: newReserved.lt(Decimal.ZERO) ? Decimal.ZERO : newReserved,
            total: newTotal.lt(Decimal.ZERO) ? Decimal.ZERO : newTotal,
            version: currentBalance.version + 1,
            updatedAt: now,
          };
          await tx.saveWalletBalance(newBalance);

          const shortfallRecord: SettlementShortfallRecord = {
            id: this.idGenerator("shortfall"),
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            workspaceId: reservation.workspaceId,
            reservationId: reservation.id,
            requestId: reservation.requestId,
            currency: reservation.currency,
            reservedAmount,
            finalCustomerPrice: finalPrice,
            shortfallAmount,
            status: "open",
            createdAt: now,
          };
          await tx.saveSettlementShortfall(shortfallRecord);

          await tx.appendLedgerEntry({
            id: this.idGenerator("led"),
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            currency: reservation.currency,
            sequence: BigInt(newBalance.version),
            entryType: "usage_settlement",
            amount: reservedAmount,
            direction: "debit",
            referenceType: "settlement",
            referenceId: reservation.id,
            idempotencyKey: params.idempotencyKey,
            balanceAfter: {
              available: newBalance.available,
              reserved: newBalance.reserved,
              total: newBalance.total,
            },
            metadata: {
              requestId: reservation.requestId,
              shortfall: shortfallAmount.toString(),
            },
            createdAt: now,
          });
        }
      }

      reservation.status = "settled";
      reservation.settledAt = now;
      await tx.saveReservation(reservation);

      return {
        status,
        consumedAmount,
        releasedAmount,
        overageAmount,
        shortfallAmount,
        reservation,
      };
    });
  }

  /**
   * Releases an unconsumed reservation (e.g. on execution error, policy failure, or 0 billable usage).
   */
  async releaseReservation(
    params: ReleaseReservationParams,
  ): Promise<CreditReservation> {
    const now = new Date();

    return this.repository.withTransaction(async (tx) => {
      const reservation = await tx.getReservationById(params.reservationId);
      if (!reservation) {
        throw new Error(`Reservation not found: ${params.reservationId}`);
      }

      if (reservation.status === "released") {
        return reservation;
      }

      if (reservation.status !== "active") {
        throw new Error(
          `Cannot release reservation with status ${reservation.status}`,
        );
      }

      const reservedAmount = reservation.reservedAmount;
      const wallet = (await tx.getWalletById(reservation.walletId))!;
      const currentBalance = (await tx.getWalletBalance(wallet.id))!;
      const allocations = await tx.getReservationAllocations(reservation.id);

      // Release reserved amounts back to lots
      for (const alloc of allocations) {
        const lot = await tx.getCreditLotById(alloc.creditLotId);
        if (!lot) continue;

        alloc.releasedAmount = alloc.allocatedAmount;
        alloc.consumedAmount = Decimal.ZERO;

        lot.reservedAmount = lot.reservedAmount.sub(alloc.allocatedAmount);
        await tx.saveCreditLot(lot);
      }

      await tx.saveReservationAllocations(allocations);

      // Update Materialized Balance
      const newReserved = currentBalance.reserved.sub(reservedAmount);
      const newAvailable = currentBalance.available.add(reservedAmount);

      const newBalance: WalletBalance = {
        walletId: wallet.id,
        available: newAvailable,
        reserved: newReserved.lt(Decimal.ZERO) ? Decimal.ZERO : newReserved,
        total: currentBalance.total,
        version: currentBalance.version + 1,
        updatedAt: now,
      };

      await tx.saveWalletBalance(newBalance);

      // Update Budget
      const budget = await tx.getWorkspaceBudget(
        reservation.workspaceId,
        "monthly",
      );
      if (budget && budget.enabled) {
        budget.reservedInPeriod = budget.reservedInPeriod.sub(reservedAmount);
        budget.updatedAt = now;
        await tx.saveWorkspaceBudget(budget);
      }

      // Append Release Ledger Entry
      const sequence = BigInt(newBalance.version);
      await tx.appendLedgerEntry({
        id: this.idGenerator("led"),
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        currency: reservation.currency,
        sequence,
        entryType: "reservation_release",
        amount: reservedAmount,
        direction: "credit",
        referenceType: "reservation",
        referenceId: reservation.id,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: {
          available: newBalance.available,
          reserved: newBalance.reserved,
          total: newBalance.total,
        },
        metadata: { reason: params.reason ?? "released_unconsumed" },
        createdAt: now,
      });

      reservation.status = "released";
      reservation.releasedAt = now;
      await tx.saveReservation(reservation);

      return reservation;
    });
  }

  /**
   * Issues a credit refund to the organization's wallet.
   */
  async refundCredits(params: RefundCreditsParams): Promise<WalletLedgerEntry> {
    const amount = Decimal.from(params.amount);
    const currency = params.currency ?? "USD";

    return this.repository.withTransaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(
        params.organizationId,
        currency,
        tx,
      );
      const now = new Date();

      const lot: CreditLot = {
        id: this.idGenerator("lot"),
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        lotType: "refund",
        currency,
        originalAmount: amount,
        remainingAmount: amount,
        reservedAmount: Decimal.ZERO,
        sourceType: "refund",
        sourceId: params.referenceId,
        grantedAt: now,
        expiresAt: null,
        createdAt: now,
      };
      await tx.saveCreditLot(lot);

      const currentBalance = (await tx.getWalletBalance(wallet.id))!;
      const newAvailable = currentBalance.available.add(amount);
      const newTotal = currentBalance.total.add(amount);

      const newBalance: WalletBalance = {
        walletId: wallet.id,
        available: newAvailable,
        reserved: currentBalance.reserved,
        total: newTotal,
        version: currentBalance.version + 1,
        updatedAt: now,
      };
      await tx.saveWalletBalance(newBalance);

      const ledgerEntry: WalletLedgerEntry = {
        id: this.idGenerator("led"),
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        currency,
        sequence: BigInt(newBalance.version),
        entryType: "refund",
        amount,
        direction: "credit",
        referenceType: "refund",
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: {
          available: newAvailable,
          reserved: currentBalance.reserved,
          total: newTotal,
        },
        metadata: { reason: params.reason },
        createdAt: now,
      };
      await tx.appendLedgerEntry(ledgerEntry);

      return ledgerEntry;
    });
  }

  /**
   * Applies an authoritative manual adjustment (requires JIT capability).
   */
  async applyAdjustment(
    params: ApplyAdjustmentParams,
  ): Promise<WalletAdjustmentRecord> {
    const amount = Decimal.from(params.amount);
    const currency = params.currency ?? "USD";

    return this.repository.withTransaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(
        params.organizationId,
        currency,
        tx,
      );
      const currentBalance = (await tx.getWalletBalance(wallet.id))!;
      const now = new Date();

      let newAvailable = currentBalance.available;
      let newTotal = currentBalance.total;

      if (params.direction === "credit") {
        newAvailable = newAvailable.add(amount);
        newTotal = newTotal.add(amount);

        const lot: CreditLot = {
          id: this.idGenerator("lot"),
          walletId: wallet.id,
          organizationId: wallet.organizationId,
          lotType: "manual",
          currency,
          originalAmount: amount,
          remainingAmount: amount,
          reservedAmount: Decimal.ZERO,
          sourceType: "adjustment",
          sourceId: params.reference,
          grantedAt: now,
          expiresAt: null,
          createdAt: now,
        };
        await tx.saveCreditLot(lot);
      } else {
        if (currentBalance.available.lt(amount) && !wallet.allowNegative) {
          throw new Error(
            `Cannot debit adjustment: available balance ${currentBalance.available.toString()} is less than ${amount.toString()}`,
          );
        }
        newAvailable = newAvailable.sub(amount);
        newTotal = newTotal.sub(amount);
      }

      const newBalance: WalletBalance = {
        walletId: wallet.id,
        available: newAvailable.lt(Decimal.ZERO) ? Decimal.ZERO : newAvailable,
        reserved: currentBalance.reserved,
        total: newTotal.lt(Decimal.ZERO) ? Decimal.ZERO : newTotal,
        version: currentBalance.version + 1,
        updatedAt: now,
      };
      await tx.saveWalletBalance(newBalance);

      const entryType =
        params.direction === "credit"
          ? "adjustment_credit"
          : "adjustment_debit";
      const ledgerEntryId = this.idGenerator("led");
      const ledgerEntry: WalletLedgerEntry = {
        id: ledgerEntryId,
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        currency,
        sequence: BigInt(newBalance.version),
        entryType,
        amount,
        direction: params.direction,
        referenceType: "adjustment",
        referenceId: params.reference,
        idempotencyKey: params.idempotencyKey,
        balanceAfter: {
          available: newBalance.available,
          reserved: newBalance.reserved,
          total: newBalance.total,
        },
        metadata: {
          reason: params.reason,
          createdBy: params.createdBy,
          jitGrantId: params.jitGrantId,
        },
        createdAt: now,
      };
      await tx.appendLedgerEntry(ledgerEntry);

      const record: WalletAdjustmentRecord = {
        id: this.idGenerator("adj"),
        walletId: wallet.id,
        organizationId: wallet.organizationId,
        amount,
        direction: params.direction,
        currency,
        reason: params.reason,
        reference: params.reference,
        createdBy: params.createdBy,
        jitGrantId: params.jitGrantId,
        ledgerEntryId,
        createdAt: now,
      };
      await tx.saveWalletAdjustmentLog(record);

      return record;
    });
  }

  /**
   * Freezes wallet (prevents new reservations).
   */
  async freezeWallet(walletId: string): Promise<void> {
    await this.repository.updateWalletStatus(walletId, "frozen");
  }

  /**
   * Unfreezes wallet.
   */
  async unfreezeWallet(walletId: string): Promise<void> {
    await this.repository.updateWalletStatus(walletId, "active");
  }

  /**
   * Rebuilds materialized balance from scratch by replaying immutable ledger entries.
   */
  async rebuildBalance(
    walletId: string,
  ): Promise<{ balance: WalletBalance; discrepancies: string[] }> {
    const entries = await this.repository.listLedgerEntries(walletId, 100000);
    const rebuilt = calculateBalanceFromLedger(entries, walletId);

    const materialized = await this.repository.getWalletBalance(walletId);
    const discrepancies: string[] = [];

    if (materialized) {
      const integrity = verifyBalanceIntegrity(materialized, rebuilt);
      if (!integrity.matches) {
        discrepancies.push(...integrity.discrepancies);
      }
    }

    // Save corrected rebuilt balance
    await this.repository.saveWalletBalance(rebuilt);

    return { balance: rebuilt, discrepancies };
  }

  /**
   * Sets or updates workspace budget limit.
   */
  async setWorkspaceBudget(budget: WorkspaceBudget): Promise<void> {
    await this.repository.saveWorkspaceBudget(budget);
  }

  /**
   * Retrieves workspace budget.
   */
  async getWorkspaceBudget(
    workspaceId: string,
    period: WorkspaceBudget["period"] = "monthly",
  ): Promise<WorkspaceBudget | null> {
    return this.repository.getWorkspaceBudget(workspaceId, period);
  }
}
