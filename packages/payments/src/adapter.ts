import type { Decimal } from "@growx/money";
import type {
  PaymentStatus,
  RefundStatus,
  PaymentFailureCategory,
  NormalizedPaymentEvent,
} from "./types.js";

export interface CreateCustomerInput {
  organizationId: string;
  email?: string;
  name?: string;
  idempotencyKey?: string;
}

export interface CreateCustomerResult {
  providerCustomerId: string;
}

export interface CreateCheckoutSessionInput {
  organizationId: string;
  providerCustomerId?: string;
  amount: Decimal;
  currency: string;
  purpose: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface CreateCheckoutSessionResult {
  providerSessionId: string;
  checkoutUrl: string;
}

export interface CreatePaymentIntentInput {
  organizationId: string;
  providerCustomerId?: string;
  providerPaymentMethodId?: string;
  amount: Decimal;
  currency: string;
  purpose: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  confirmImmediate?: boolean;
}

export interface CreatePaymentIntentResult {
  providerPaymentId: string;
  status: PaymentStatus;
  failureCategory?: PaymentFailureCategory;
  failureMessage?: string;
  clientSecret?: string;
}

export interface CreateSubscriptionInput {
  organizationId: string;
  providerCustomerId: string;
  planVersionId: string;
  billingInterval: string;
  amount: Decimal;
  currency: string;
  idempotencyKey: string;
}

export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
  status: string;
}

export interface CancelSubscriptionResult {
  providerSubscriptionId: string;
  status: string;
}

export interface RefundPaymentInput {
  providerPaymentId: string;
  amount: Decimal;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundPaymentResult {
  providerRefundId: string;
  status: RefundStatus;
}

export interface VerifyWebhookResult {
  verified: boolean;
  event: NormalizedPaymentEvent;
}

export interface RetrievePaymentResult {
  providerPaymentId: string;
  status: PaymentStatus;
  amount: Decimal;
  currency: string;
  failureCategory?: PaymentFailureCategory;
  failureMessage?: string;
}

export interface RetrieveSubscriptionResult {
  providerSubscriptionId: string;
  status: string;
}

/**
 * Provider-abstracted interface for payment gateways (Stripe, Razorpay, Mock).
 * Domain code and services interact strictly through this contract.
 */
export interface PaymentProviderAdapter {
  readonly providerName: string;

  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;

  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionResult>;

  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResult>;

  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult>;

  cancelSubscription(
    providerSubscriptionId: string,
    atPeriodEnd?: boolean,
  ): Promise<CancelSubscriptionResult>;

  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;

  verifyWebhook(
    payload: Uint8Array,
    signature: string,
    headers?: Record<string, string>,
  ): Promise<VerifyWebhookResult>;

  retrievePayment(providerPaymentId: string): Promise<RetrievePaymentResult>;

  retrieveSubscription(
    providerSubscriptionId: string,
  ): Promise<RetrieveSubscriptionResult>;
}
