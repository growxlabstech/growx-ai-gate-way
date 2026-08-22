import { Decimal } from "@growx/money";
import type {
  ICreditRepository,
  WalletBalance,
  WalletLedgerEntry,
} from "../domain/types.js";

export interface ExpirationRunResult {
  lotsProcessed: number;
  totalExpiredCredits: Decimal;
  expiredLotIds: string[];
}

export class CreditExpirationWorker {
  constructor(
    private readonly repository: ICreditRepository,
    private readonly idGenerator: (prefix: string) => string = (p) =>
      `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ) {}

  /**
   * Sweeps expired credit lots and debits unreserved expired amounts.
   */
  async processExpiredLots(
    now: Date = new Date(),
  ): Promise<ExpirationRunResult> {
    const expiredLots = await this.repository.listExpiredCreditLots(now);
    let totalExpired = Decimal.ZERO;
    const expiredLotIds: string[] = [];

    for (const lot of expiredLots) {
      const availableToExpire = lot.remainingAmount.sub(lot.reservedAmount);
      if (availableToExpire.lte(Decimal.ZERO)) continue;

      await this.repository.withTransaction(async (tx) => {
        const freshLot = await tx.getCreditLotById(lot.id);
        if (!freshLot) return;

        const unreservedExpired = freshLot.remainingAmount.sub(
          freshLot.reservedAmount,
        );
        if (unreservedExpired.lte(Decimal.ZERO)) return;

        // Debit remaining amount
        freshLot.remainingAmount =
          freshLot.remainingAmount.sub(unreservedExpired);
        await tx.saveCreditLot(freshLot);

        const currentBalance = (await tx.getWalletBalance(freshLot.walletId))!;
        const newAvailable = currentBalance.available.sub(unreservedExpired);
        const newTotal = currentBalance.total.sub(unreservedExpired);

        const newBalance: WalletBalance = {
          walletId: freshLot.walletId,
          available: newAvailable.lt(Decimal.ZERO)
            ? Decimal.ZERO
            : newAvailable,
          reserved: currentBalance.reserved,
          total: newTotal.lt(Decimal.ZERO) ? Decimal.ZERO : newTotal,
          version: currentBalance.version + 1,
          updatedAt: now,
        };
        await tx.saveWalletBalance(newBalance);

        const ledgerEntry: WalletLedgerEntry = {
          id: this.idGenerator("led"),
          walletId: freshLot.walletId,
          organizationId: freshLot.organizationId,
          currency: freshLot.currency,
          sequence: BigInt(newBalance.version),
          entryType: "expiration",
          amount: unreservedExpired,
          direction: "debit",
          referenceType: "expiration",
          referenceId: freshLot.id,
          balanceAfter: {
            available: newBalance.available,
            reserved: newBalance.reserved,
            total: newBalance.total,
          },
          metadata: {
            reason: "lot_expired",
            expiresAt: freshLot.expiresAt?.toISOString(),
          },
          createdAt: now,
        };
        await tx.appendLedgerEntry(ledgerEntry);

        totalExpired = totalExpired.add(unreservedExpired);
        expiredLotIds.push(freshLot.id);
      });
    }

    return {
      lotsProcessed: expiredLots.length,
      totalExpiredCredits: totalExpired,
      expiredLotIds,
    };
  }
}
