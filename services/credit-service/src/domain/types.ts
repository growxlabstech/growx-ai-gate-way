export * from "@growx/credits";

import type {
  BillingAuthorizationRecord,
  BudgetPeriod,
  CreditLot,
  CreditReservation,
  ReservationAllocation,
  SettlementShortfallRecord,
  Wallet,
  WalletAdjustmentRecord,
  WalletBalance,
  WalletLedgerEntry,
  WalletStatus,
  WorkspaceBudget,
} from "@growx/credits";
import { Decimal } from "@growx/money";

export interface GrantCreditsParams {
  organizationId: string;
  amount: Decimal | string | number;
  lotType?: CreditLot["lotType"] | undefined;
  currency?: string | undefined;
  sourceType: string;
  sourceId: string;
  expiresAt?: Date | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  idempotencyKey?: string | undefined;
}

export interface AuthorizeBillingParams {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  estimatedPrice: Decimal | string | number;
  currency?: string | undefined;
  pricingPolicyId?: string | undefined;
  pricingPolicyVersion?: string | undefined;
  reservationTtlSeconds?: number | undefined;
  idempotencyKey?: string | undefined;
}

export interface SettleReservationParams {
  reservationId: string;
  finalCustomerPrice: Decimal | string | number;
  actualInputTokens?: number | undefined;
  actualOutputTokens?: number | undefined;
  currency?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ReleaseReservationParams {
  reservationId: string;
  reason?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface RefundCreditsParams {
  organizationId: string;
  amount: Decimal | string | number;
  currency?: string | undefined;
  reason: string;
  referenceId: string;
  idempotencyKey?: string | undefined;
}

export interface ApplyAdjustmentParams {
  organizationId: string;
  amount: Decimal | string | number;
  direction: "credit" | "debit";
  currency?: string | undefined;
  reason: string;
  reference: string;
  createdBy: string;
  jitGrantId?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ICreditRepository {
  getWalletById(walletId: string): Promise<Wallet | null>;
  getWalletByOrganization(
    organizationId: string,
    currency?: string,
  ): Promise<Wallet | null>;
  createWallet(wallet: Wallet): Promise<Wallet>;
  updateWalletStatus(walletId: string, status: WalletStatus): Promise<void>;
  getWalletBalance(walletId: string): Promise<WalletBalance | null>;
  saveWalletBalance(balance: WalletBalance): Promise<void>;
  appendLedgerEntry(entry: WalletLedgerEntry): Promise<void>;
  listLedgerEntries(
    walletId: string,
    limit?: number,
    beforeSequence?: bigint,
  ): Promise<WalletLedgerEntry[]>;
  getLedgerEntryByIdempotencyKey(
    walletId: string,
    idempotencyKey: string,
  ): Promise<WalletLedgerEntry | null>;
  getActiveCreditLots(walletId: string): Promise<CreditLot[]>;
  getCreditLotById(lotId: string): Promise<CreditLot | null>;
  saveCreditLot(lot: CreditLot): Promise<void>;
  saveCreditLots(lots: CreditLot[]): Promise<void>;
  getReservationById(reservationId: string): Promise<CreditReservation | null>;
  getReservationByRequestId(
    requestId: string,
  ): Promise<CreditReservation | null>;
  saveReservation(reservation: CreditReservation): Promise<void>;
  saveReservationAllocations(
    allocations: ReservationAllocation[],
  ): Promise<void>;
  getReservationAllocations(
    reservationId: string,
  ): Promise<ReservationAllocation[]>;
  getWorkspaceBudget(
    workspaceId: string,
    period?: BudgetPeriod,
  ): Promise<WorkspaceBudget | null>;
  saveWorkspaceBudget(budget: WorkspaceBudget): Promise<void>;
  saveBillingAuthorizationRecord(
    record: BillingAuthorizationRecord,
  ): Promise<void>;
  getBillingAuthorizationByRequestId(
    requestId: string,
  ): Promise<BillingAuthorizationRecord | null>;
  saveSettlementShortfall(record: SettlementShortfallRecord): Promise<void>;
  saveWalletAdjustmentLog(record: WalletAdjustmentRecord): Promise<void>;
  listExpiredCreditLots(now?: Date): Promise<CreditLot[]>;
  listStaleReservations(cutoff: Date): Promise<CreditReservation[]>;
  withTransaction<T>(fn: (txRepo: ICreditRepository) => Promise<T>): Promise<T>;
}
