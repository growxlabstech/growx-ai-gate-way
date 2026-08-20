import { Decimal } from "@growx/money";

// ─── Currency Utilities & Minor Units ─────────────────────────

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "JOD", "KWD", "OMR", "TND"
]);

export function getCurrencyDecimalPlaces(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function toMinorUnits(amount: Decimal, currency: string): bigint {
  const decimals = getCurrencyDecimalPlaces(currency);
  const factor = 10n ** BigInt(decimals);
  const str = amount.toFixed(decimals);
  const [whole, frac = ""] = str.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${whole}${paddedFrac}`;
  return BigInt(combined);
}

export function fromMinorUnits(minor: bigint | number | string, currency: string): Decimal {
  const decimals = getCurrencyDecimalPlaces(currency);
  const minorBig = BigInt(minor.toString());
  if (decimals === 0) {
    return Decimal.from(minorBig.toString());
  }
  const factor = 10n ** BigInt(decimals);
  const isNeg = minorBig < 0n;
  const absVal = isNeg ? -minorBig : minorBig;
  const whole = absVal / factor;
  const rem = absVal % factor;
  const remStr = rem.toString().padStart(decimals, "0");
  const sign = isNeg ? "-" : "";
  return Decimal.from(`${sign}${whole}.${remStr}`);
}

// ─── Status Enums & Types ─────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "authorized"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

export type CheckoutStatus =
  | "created"
  | "provider_created"
  | "open"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

export type CheckoutPurpose =
  | "subscription_start"
  | "subscription_change"
  | "credit_purchase_future";

export type RefundStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";

export type PaymentFailureCategory =
  | "insufficient_funds"
  | "authentication_required"
  | "expired_method"
  | "provider_decline"
  | "network"
  | "provider_error"
  | "fraud_block"
  | "unknown";

// ─── Domain Entities ──────────────────────────────────────────

export interface PaymentCustomer {
  id: string;
  organizationId: string;
  provider: string;
  providerCustomerId: string;
  status: "active" | "archived";
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodReference {
  id: string;
  organizationId: string;
  provider: string;
  providerPaymentMethodId: string;
  type: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  status: "active" | "expired" | "detached";
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckoutSession {
  id: string;
  organizationId: string;
  provider: string;
  purpose: CheckoutPurpose;
  planId?: string;
  planVersionId?: string;
  amount: Decimal;
  currency: string;
  status: CheckoutStatus;
  providerSessionId?: string;
  checkoutUrl?: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface Payment {
  id: string;
  organizationId: string;
  provider: string;
  providerPaymentId?: string;
  paymentCustomerId?: string;
  purpose: string;
  referenceType?: string;
  referenceId?: string;
  amount: Decimal;
  currency: string;
  status: PaymentStatus;
  providerStatus?: string;
  failureCode?: string;
  failureCategory?: PaymentFailureCategory;
  failureMessage?: string;
  refundedAmount: Decimal;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  authorizedAt?: Date;
  capturedAt?: Date;
  failedAt?: Date;
  updatedAt: Date;
}

export interface PaymentAttempt {
  id: string;
  paymentId: string;
  provider: string;
  providerAttemptId?: string;
  attemptNumber: number;
  status: "pending" | "succeeded" | "failed" | "requires_action";
  failureCode?: string;
  failureCategory?: PaymentFailureCategory;
  failureMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface PaymentProviderEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  receivedAt: Date;
  verified: boolean;
  processingStatus: "pending" | "processed" | "failed" | "ignored";
  payloadReference?: string;
  rawPayloadHash: string;
  eventCreatedAt?: Date;
  processedAt?: Date;
  error?: string;
}

export interface PaymentRefund {
  id: string;
  paymentId: string;
  organizationId: string;
  provider: string;
  providerRefundId?: string;
  amount: Decimal;
  currency: string;
  reason: string;
  status: RefundStatus;
  idempotencyKey: string;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface NormalizedPaymentEvent {
  provider: string;
  eventId: string;
  eventType:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.requires_action"
    | "checkout.completed"
    | "refund.succeeded"
    | "unknown";
  providerPaymentId?: string | undefined;
  providerCustomerId?: string | undefined;
  providerSessionId?: string | undefined;
  providerRefundId?: string | undefined;
  amount?: Decimal | undefined;
  currency?: string | undefined;
  status: string;
  failureCategory?: PaymentFailureCategory | undefined;
  failureMessage?: string | undefined;
  occurredAt: Date;
  metadata: Record<string, unknown>;
}
