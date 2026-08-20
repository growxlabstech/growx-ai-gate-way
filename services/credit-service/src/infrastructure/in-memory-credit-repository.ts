import { Decimal } from "@growx/money";
import type {
  BillingAuthorizationRecord,
  BudgetPeriod,
  CreditLot,
  CreditReservation,
  ICreditRepository,
  ReservationAllocation,
  SettlementShortfallRecord,
  Wallet,
  WalletAdjustmentRecord,
  WalletBalance,
  WalletLedgerEntry,
  WalletStatus,
  WorkspaceBudget,
} from "../domain/types.js";

export class InMemoryCreditRepository implements ICreditRepository {
  private wallets = new Map<string, Wallet>();
  private balances = new Map<string, WalletBalance>();
  private ledgerEntries = new Map<string, WalletLedgerEntry[]>();
  private creditLots = new Map<string, CreditLot>();
  private reservations = new Map<string, CreditReservation>();
  private allocations = new Map<string, ReservationAllocation[]>();
  private workspaceBudgets = new Map<string, WorkspaceBudget>();
  private billingAuthRecords = new Map<string, BillingAuthorizationRecord>();
  private settlementShortfalls = new Map<string, SettlementShortfallRecord>();
  private adjustmentLogs = new Map<string, WalletAdjustmentRecord[]>();

  constructor() {}

  async getWalletById(walletId: string): Promise<Wallet | null> {
    const w = this.wallets.get(walletId);
    return w ? { ...w } : null;
  }

  async getWalletByOrganization(organizationId: string, currency: string = "USD"): Promise<Wallet | null> {
    for (const w of this.wallets.values()) {
      if (w.organizationId === organizationId && w.currency === currency) {
        return { ...w };
      }
    }
    return null;
  }

  async createWallet(wallet: Wallet): Promise<Wallet> {
    const clone = { ...wallet };
    this.wallets.set(wallet.id, clone);
    return { ...clone };
  }

  async updateWalletStatus(walletId: string, status: WalletStatus): Promise<void> {
    const w = this.wallets.get(walletId);
    if (w) {
      w.status = status;
      w.updatedAt = new Date();
    }
  }

  async getWalletBalance(walletId: string): Promise<WalletBalance | null> {
    const b = this.balances.get(walletId);
    return b ? { ...b } : null;
  }

  async saveWalletBalance(balance: WalletBalance): Promise<void> {
    this.balances.set(balance.walletId, { ...balance });
  }

  async appendLedgerEntry(entry: WalletLedgerEntry): Promise<void> {
    const entries = this.ledgerEntries.get(entry.walletId) ?? [];
    entries.push({ ...entry });
    this.ledgerEntries.set(entry.walletId, entries);
  }

  async listLedgerEntries(walletId: string, limit: number = 50, beforeSequence?: bigint): Promise<WalletLedgerEntry[]> {
    const entries = this.ledgerEntries.get(walletId) ?? [];
    let filtered = entries;
    if (beforeSequence !== undefined) {
      filtered = entries.filter((e) => e.sequence < beforeSequence);
    }
    const sorted = [...filtered].sort((a, b) => (a.sequence > b.sequence ? -1 : 1));
    return sorted.slice(0, limit).map((e) => ({ ...e }));
  }

  async getLedgerEntryByIdempotencyKey(walletId: string, idempotencyKey: string): Promise<WalletLedgerEntry | null> {
    const entries = this.ledgerEntries.get(walletId) ?? [];
    const found = entries.find((e) => e.idempotencyKey === idempotencyKey);
    return found ? { ...found } : null;
  }

  async getActiveCreditLots(walletId: string): Promise<CreditLot[]> {
    const results: CreditLot[] = [];
    const now = Date.now();
    for (const lot of this.creditLots.values()) {
      if (lot.walletId === walletId) {
        const isUnexpired = lot.expiresAt === null || lot.expiresAt === undefined || lot.expiresAt.getTime() > now;
        const hasRemaining = lot.remainingAmount.gt(Decimal.ZERO);
        if (isUnexpired && hasRemaining) {
          results.push({ ...lot });
        }
      }
    }
    return results;
  }

  async getCreditLotById(lotId: string): Promise<CreditLot | null> {
    const lot = this.creditLots.get(lotId);
    return lot ? { ...lot } : null;
  }

  async saveCreditLot(lot: CreditLot): Promise<void> {
    this.creditLots.set(lot.id, { ...lot });
  }

  async saveCreditLots(lots: CreditLot[]): Promise<void> {
    for (const lot of lots) {
      this.creditLots.set(lot.id, { ...lot });
    }
  }

  async getReservationById(reservationId: string): Promise<CreditReservation | null> {
    const r = this.reservations.get(reservationId);
    return r ? { ...r } : null;
  }

  async getReservationByRequestId(requestId: string): Promise<CreditReservation | null> {
    for (const r of this.reservations.values()) {
      if (r.requestId === requestId) {
        return { ...r };
      }
    }
    return null;
  }

  async saveReservation(reservation: CreditReservation): Promise<void> {
    this.reservations.set(reservation.id, { ...reservation });
  }

  async saveReservationAllocations(allocations: ReservationAllocation[]): Promise<void> {
    for (const alloc of allocations) {
      const existing = this.allocations.get(alloc.reservationId) ?? [];
      const idx = existing.findIndex((a) => a.id === alloc.id);
      if (idx >= 0) {
        existing[idx] = { ...alloc };
      } else {
        existing.push({ ...alloc });
      }
      this.allocations.set(alloc.reservationId, existing);
    }
  }

  async getReservationAllocations(reservationId: string): Promise<ReservationAllocation[]> {
    const allocs = this.allocations.get(reservationId) ?? [];
    return allocs.map((a) => ({ ...a }));
  }

  async getWorkspaceBudget(workspaceId: string, period: BudgetPeriod = "monthly"): Promise<WorkspaceBudget | null> {
    const key = `${workspaceId}:${period}`;
    const b = this.workspaceBudgets.get(key);
    return b ? { ...b } : null;
  }

  async saveWorkspaceBudget(budget: WorkspaceBudget): Promise<void> {
    const key = `${budget.workspaceId}:${budget.period}`;
    this.workspaceBudgets.set(key, { ...budget });
  }

  async saveBillingAuthorizationRecord(record: BillingAuthorizationRecord): Promise<void> {
    this.billingAuthRecords.set(record.requestId, { ...record });
  }

  async getBillingAuthorizationByRequestId(requestId: string): Promise<BillingAuthorizationRecord | null> {
    const r = this.billingAuthRecords.get(requestId);
    return r ? { ...r } : null;
  }

  async saveSettlementShortfall(record: SettlementShortfallRecord): Promise<void> {
    this.settlementShortfalls.set(record.id, { ...record });
  }

  async saveWalletAdjustmentLog(record: WalletAdjustmentRecord): Promise<void> {
    const logs = this.adjustmentLogs.get(record.walletId) ?? [];
    logs.push({ ...record });
    this.adjustmentLogs.set(record.walletId, logs);
  }

  async listExpiredCreditLots(now: Date = new Date()): Promise<CreditLot[]> {
    const results: CreditLot[] = [];
    for (const lot of this.creditLots.values()) {
      if (lot.expiresAt && lot.expiresAt.getTime() <= now.getTime() && lot.remainingAmount.gt(Decimal.ZERO)) {
        results.push({ ...lot });
      }
    }
    return results;
  }

  async listStaleReservations(cutoff: Date): Promise<CreditReservation[]> {
    const results: CreditReservation[] = [];
    for (const r of this.reservations.values()) {
      if (r.status === "active" && r.createdAt.getTime() < cutoff.getTime()) {
        results.push({ ...r });
      }
    }
    return results;
  }

  /**
   * Executes a transaction block for in-memory testing.
   */
  async withTransaction<T>(fn: (txRepo: ICreditRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
