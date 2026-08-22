import { Decimal } from "@growx/money";

export type WalletStatus = "active" | "frozen" | "closed";

export interface Wallet {
  id: string;
  organizationId: string;
  currency: string;
  status: WalletStatus;
  creditLimit: Decimal; // Defaults to Decimal.ZERO
  allowNegative: boolean; // Defaults to false
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletBalance {
  walletId: string;
  available: Decimal;
  reserved: Decimal;
  total: Decimal;
  version: number;
  updatedAt: Date;
}

export type WalletLedgerEntryType =
  | "credit_grant"
  | "credit_purchase_future"
  | "reservation"
  | "reservation_release"
  | "usage_settlement"
  | "adjustment_credit"
  | "adjustment_debit"
  | "refund"
  | "expiration";

export type WalletLedgerDirection = "credit" | "debit";

export type WalletReferenceType =
  | "grant"
  | "reservation"
  | "settlement"
  | "adjustment"
  | "refund"
  | "expiration"
  | "request";

export interface WalletLedgerEntry {
  id: string;
  walletId: string;
  organizationId: string;
  currency: string;
  sequence: bigint;
  entryType: WalletLedgerEntryType;
  amount: Decimal;
  direction: WalletLedgerDirection;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey?: string | undefined;
  balanceAfter?:
    | {
        available: Decimal;
        reserved: Decimal;
        total: Decimal;
      }
    | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
}

export type CreditLotType =
  "promotional" | "trial" | "subscription" | "purchased" | "refund" | "manual";

export interface CreditLot {
  id: string;
  walletId: string;
  organizationId: string;
  lotType: CreditLotType;
  currency: string;
  originalAmount: Decimal;
  remainingAmount: Decimal;
  reservedAmount: Decimal;
  sourceType: string;
  sourceId: string;
  grantedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

export type ReservationStatus =
  "pending" | "active" | "settled" | "released" | "expired" | "cancelled";

export interface ReservationAllocation {
  id: string;
  reservationId: string;
  creditLotId: string;
  allocatedAmount: Decimal;
  consumedAmount?: Decimal | undefined;
  releasedAmount?: Decimal | undefined;
  createdAt: Date;
}

export interface CreditReservation {
  id: string;
  walletId: string;
  organizationId: string;
  workspaceId: string;
  requestId: string;
  apiKeyId?: string | undefined;
  currency: string;
  estimatedAmount: Decimal;
  reservedAmount: Decimal;
  status: ReservationStatus;
  allocations: ReservationAllocation[];
  pricingPolicyId?: string | undefined;
  pricingPolicyVersion?: string | undefined;
  idempotencyKey?: string | undefined;
  expiresAt: Date;
  createdAt: Date;
  settledAt?: Date | null | undefined;
  releasedAt?: Date | null | undefined;
}

export type BudgetPeriod = "daily" | "monthly" | "total";

export interface WorkspaceBudget {
  id: string;
  organizationId: string;
  workspaceId: string;
  currency: string;
  period: BudgetPeriod;
  hardLimit: Decimal;
  warningThreshold?: Decimal | undefined;
  spentInPeriod: Decimal;
  reservedInPeriod: Decimal;
  periodStart: Date;
  periodEnd: Date;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type BillingDecision =
  | "AUTHORIZED"
  | "INSUFFICIENT_CREDITS"
  | "WALLET_FROZEN"
  | "BUDGET_EXCEEDED"
  | "PRICING_UNAVAILABLE"
  | "CURRENCY_MISMATCH"
  | "BILLING_DISABLED";

export interface BillingAuthorizationRecord {
  id: string;
  requestId: string;
  organizationId: string;
  workspaceId: string;
  walletId?: string | undefined;
  reservationId?: string | undefined;
  decision: BillingDecision;
  reason?: string | undefined;
  estimatedPrice: Decimal;
  requiredReservation: Decimal;
  availableAtDecision?: Decimal | undefined;
  currency: string;
  pricingPolicyVersion?: string | undefined;
  createdAt: Date;
}

export interface BillingAuthorizationResult {
  authorized: boolean;
  decision: BillingDecision;
  reservationId?: string | undefined;
  estimatedPrice: Decimal;
  reservedAmount: Decimal;
  currency: string;
  reason?: string | undefined;
  availableBalance?: Decimal | undefined;
}

export interface SettlementResult {
  status: "settled" | "shortfall";
  consumedAmount: Decimal;
  releasedAmount: Decimal;
  overageAmount: Decimal;
  shortfallAmount: Decimal;
  reservation: CreditReservation;
}

export interface SettlementShortfallRecord {
  id: string;
  walletId: string;
  organizationId: string;
  workspaceId: string;
  reservationId: string;
  requestId: string;
  currency: string;
  reservedAmount: Decimal;
  finalCustomerPrice: Decimal;
  shortfallAmount: Decimal;
  status: "open" | "resolved" | "written_off";
  createdAt: Date;
  resolvedAt?: Date | null | undefined;
}

export interface WalletAdjustmentRecord {
  id: string;
  walletId: string;
  organizationId: string;
  amount: Decimal;
  direction: "credit" | "debit";
  currency: string;
  reason: string;
  reference: string;
  createdBy: string;
  jitGrantId?: string | undefined;
  ledgerEntryId: string;
  createdAt: Date;
}

export interface CreditConversionVersion {
  id: string;
  creditsNumerator: bigint;
  moneyMinorDenominator: bigint;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}
