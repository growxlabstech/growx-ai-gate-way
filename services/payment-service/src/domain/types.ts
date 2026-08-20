import type { Decimal } from "@growx/money";
import type {
  PaymentCustomer,
  PaymentMethodReference,
  CheckoutSession,
  Payment,
  PaymentAttempt,
  PaymentProviderEvent,
  PaymentRefund,
  CheckoutPurpose,
  PaymentStatus,
  RefundStatus,
  PaymentFailureCategory,
  NormalizedPaymentEvent,
} from "@growx/payments";

export type {
  PaymentCustomer,
  PaymentMethodReference,
  CheckoutSession,
  Payment,
  PaymentAttempt,
  PaymentProviderEvent,
  PaymentRefund,
  CheckoutPurpose,
  PaymentStatus,
  RefundStatus,
  PaymentFailureCategory,
  NormalizedPaymentEvent,
};

export interface IPaymentRepository {
  // ─── Customer ────────────────────────────────────────────────
  saveCustomer(customer: PaymentCustomer): Promise<void>;
  getCustomerByOrgAndProvider(orgId: string, provider: string): Promise<PaymentCustomer | undefined>;
  getCustomerByProviderId(provider: string, providerCustomerId: string): Promise<PaymentCustomer | undefined>;

  // ─── Payment Methods ─────────────────────────────────────────
  savePaymentMethod(method: PaymentMethodReference): Promise<void>;
  getPaymentMethods(orgId: string): Promise<PaymentMethodReference[]>;
  getDefaultPaymentMethod(orgId: string): Promise<PaymentMethodReference | undefined>;

  // ─── Checkout Sessions ───────────────────────────────────────
  saveCheckoutSession(session: CheckoutSession): Promise<void>;
  getCheckoutSessionById(id: string): Promise<CheckoutSession | undefined>;
  getCheckoutSessionByIdempotency(orgId: string, idempotencyKey: string): Promise<CheckoutSession | undefined>;
  getCheckoutSessionByProviderSession(provider: string, providerSessionId: string): Promise<CheckoutSession | undefined>;
  updateCheckoutSession(id: string, updates: Partial<CheckoutSession>): Promise<void>;

  // ─── Payments ────────────────────────────────────────────────
  savePayment(payment: Payment): Promise<void>;
  getPaymentById(id: string): Promise<Payment | undefined>;
  getPaymentByProviderPaymentId(provider: string, providerPaymentId: string): Promise<Payment | undefined>;
  getPaymentByIdempotency(orgId: string, idempotencyKey: string): Promise<Payment | undefined>;
  listPayments(orgId: string, filter?: { limit?: number; startingAfter?: string }): Promise<Payment[]>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<void>;

  // ─── Payment Attempts ────────────────────────────────────────
  savePaymentAttempt(attempt: PaymentAttempt): Promise<void>;
  getPaymentAttempts(paymentId: string): Promise<PaymentAttempt[]>;

  // ─── Provider Events (Webhooks) ──────────────────────────────
  saveProviderEvent(event: PaymentProviderEvent): Promise<void>;
  getProviderEvent(provider: string, providerEventId: string): Promise<PaymentProviderEvent | undefined>;
  updateProviderEvent(id: string, updates: Partial<PaymentProviderEvent>): Promise<void>;

  // ─── Refunds ─────────────────────────────────────────────────
  saveRefund(refund: PaymentRefund): Promise<void>;
  getRefundById(id: string): Promise<PaymentRefund | undefined>;
  getRefundByIdempotency(orgId: string, idempotencyKey: string): Promise<PaymentRefund | undefined>;
  listRefundsForPayment(paymentId: string): Promise<PaymentRefund[]>;
  updateRefund(id: string, updates: Partial<PaymentRefund>): Promise<void>;

  // ─── Reconciliation ──────────────────────────────────────────
  listPendingPaymentsForReconciliation(before: Date, limit: number): Promise<Payment[]>;

  // ─── Transaction ─────────────────────────────────────────────
  withTransaction<T>(fn: (tx: IPaymentRepository) => Promise<T>): Promise<T>;
}

export interface CreateSubscriptionCheckoutParams {
  organizationId: string;
  planId: string;
  planVersionId?: string;
  provider?: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RefundParams {
  paymentId: string;
  organizationId: string;
  amount?: Decimal; // If omitted, full refund
  reason: string;
  createdBy: string;
  idempotencyKey: string;
}

export interface WebhookProcessResult {
  status: "processed" | "duplicate" | "ignored" | "failed";
  eventId?: string;
  eventType?: string;
  error?: string;
}
