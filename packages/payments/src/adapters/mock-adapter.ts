import { createHmac, timingSafeEqual } from "node:crypto";
import { Decimal } from "@growx/money";
import type {
  PaymentProviderAdapter,
  CreateCustomerInput,
  CreateCustomerResult,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  CancelSubscriptionResult,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyWebhookResult,
  RetrievePaymentResult,
  RetrieveSubscriptionResult,
} from "../adapter.js";
import type { PaymentStatus, NormalizedPaymentEvent, RefundStatus } from "../types.js";

export interface MockAdapterOptions {
  webhookSecret?: string;
  forcePaymentStatus?: PaymentStatus;
  forceFailureMessage?: string;
}

/**
 * Deterministic in-memory mock payment provider adapter for testing.
 */
export class MockPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly providerName = "mock";
  private webhookSecret: string;
  private forcePaymentStatus?: PaymentStatus | undefined;
  private forceFailureMessage?: string | undefined;

  public customers = new Map<string, { id: string; orgId: string; email?: string | undefined }>();
  public checkouts = new Map<string, CreateCheckoutSessionInput & { id: string }>();
  public payments = new Map<string, { id: string; status: PaymentStatus; amount: Decimal; currency: string }>();
  public subscriptions = new Map<string, { id: string; status: string }>();
  public refunds = new Map<string, { id: string; paymentId: string; amount: Decimal; status: RefundStatus }>();

  constructor(options?: MockAdapterOptions) {
    this.webhookSecret = options?.webhookSecret ?? "mock_webhook_secret_123456";
    this.forcePaymentStatus = options?.forcePaymentStatus;
    this.forceFailureMessage = options?.forceFailureMessage;
  }

  setForcePaymentStatus(status?: PaymentStatus, message?: string) {
    this.forcePaymentStatus = status;
    this.forceFailureMessage = message;
  }

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    const providerCustomerId = `mock_cus_${input.organizationId}_${Date.now()}`;
    this.customers.set(providerCustomerId, {
      id: providerCustomerId,
      orgId: input.organizationId,
      email: input.email,
    });
    return { providerCustomerId };
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const providerSessionId = `mock_cs_${input.idempotencyKey}`;
    const checkoutUrl = `https://checkout.mockpayment.test/pay/${providerSessionId}`;
    this.checkouts.set(providerSessionId, {
      ...input,
      id: providerSessionId,
    });
    return {
      providerSessionId,
      checkoutUrl,
    };
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    const providerPaymentId = `mock_pi_${input.idempotencyKey}`;
    const status = this.forcePaymentStatus ?? "succeeded";
    this.payments.set(providerPaymentId, {
      id: providerPaymentId,
      status,
      amount: input.amount,
      currency: input.currency,
    });

    if (status === "failed") {
      return {
        providerPaymentId,
        status: "failed",
        failureCategory: "provider_decline",
        failureMessage: this.forceFailureMessage ?? "Mock payment declined",
      };
    }

    if (status === "requires_action") {
      return {
        providerPaymentId,
        status: "requires_action",
        failureCategory: "authentication_required",
        failureMessage: "3DS authentication required",
        clientSecret: `mock_secret_${providerPaymentId}`,
      };
    }

    return {
      providerPaymentId,
      status,
      clientSecret: `mock_secret_${providerPaymentId}`,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const providerSubscriptionId = `mock_sub_${input.idempotencyKey}`;
    this.subscriptions.set(providerSubscriptionId, {
      id: providerSubscriptionId,
      status: "active",
    });
    return {
      providerSubscriptionId,
      status: "active",
    };
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd?: boolean): Promise<CancelSubscriptionResult> {
    const existing = this.subscriptions.get(providerSubscriptionId);
    const newStatus = atPeriodEnd ? "cancelling" : "cancelled";
    if (existing) {
      existing.status = newStatus;
    }
    return {
      providerSubscriptionId,
      status: newStatus,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const providerRefundId = `mock_ref_${input.idempotencyKey}`;
    const existingPayment = this.payments.get(input.providerPaymentId);
    if (!existingPayment) {
      return {
        providerRefundId,
        status: "failed",
      };
    }

    this.refunds.set(providerRefundId, {
      id: providerRefundId,
      paymentId: input.providerPaymentId,
      amount: input.amount,
      status: "succeeded",
    });

    return {
      providerRefundId,
      status: "succeeded",
    };
  }

  /**
   * Helper to sign a mock webhook payload for tests.
   */
  signWebhook(payload: Uint8Array, timestamp = Math.floor(Date.now() / 1000)): string {
    const hmac = createHmac("sha256", this.webhookSecret);
    hmac.update(`${timestamp}.`);
    hmac.update(payload);
    return `t=${timestamp},v1=${hmac.digest("hex")}`;
  }

  async verifyWebhook(
    payload: Uint8Array,
    signature: string,
    _headers?: Record<string, string>
  ): Promise<VerifyWebhookResult> {
    // Parse signature t=...,v1=...
    const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      if (k && v) acc[k] = v;
      return acc;
    }, {});

    const timestamp = parseInt(parts.t ?? "0", 10);
    const expectedSig = parts.v1;

    if (!timestamp || !expectedSig) {
      return {
        verified: false,
        event: {
          provider: "mock",
          eventId: "invalid",
          eventType: "unknown",
          status: "invalid_signature",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    // Check tolerance (5 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > 300) {
      return {
        verified: false,
        event: {
          provider: "mock",
          eventId: "expired",
          eventType: "unknown",
          status: "timestamp_expired",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    const hmac = createHmac("sha256", this.webhookSecret);
    hmac.update(`${timestamp}.`);
    hmac.update(payload);
    const computedHex = hmac.digest("hex");

    let verified = false;
    try {
      const computedBuf = Buffer.from(computedHex, "hex");
      const expectedBuf = Buffer.from(expectedSig, "hex");
      verified = computedBuf.length === expectedBuf.length && timingSafeEqual(computedBuf, expectedBuf);
    } catch {
      verified = false;
    }

    if (!verified) {
      return {
        verified: false,
        event: {
          provider: "mock",
          eventId: "invalid_sig",
          eventType: "unknown",
          status: "invalid_signature",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    // Parse payload into NormalizedPaymentEvent
    try {
      const json = JSON.parse(Buffer.from(payload).toString("utf8"));
      const event: NormalizedPaymentEvent = {
        provider: "mock",
        eventId: json.id ?? `mock_evt_${Date.now()}`,
        eventType: json.type ?? "payment.succeeded",
        providerPaymentId: json.data?.paymentId ?? json.paymentId,
        providerCustomerId: json.data?.customerId ?? json.customerId,
        providerSessionId: json.data?.sessionId ?? json.sessionId,
        providerRefundId: json.data?.refundId ?? json.refundId,
        amount: json.data?.amount ? Decimal.from(json.data.amount) : undefined,
        currency: json.data?.currency ?? json.currency,
        status: json.data?.status ?? "succeeded",
        failureCategory: json.data?.failureCategory,
        failureMessage: json.data?.failureMessage,
        occurredAt: json.created ? new Date(json.created * 1000) : new Date(),
        metadata: json.data?.metadata ?? json.metadata ?? {},
      };
      return { verified: true, event };
    } catch (err) {
      return {
        verified: false,
        event: {
          provider: "mock",
          eventId: "malformed_json",
          eventType: "unknown",
          status: "malformed_payload",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }
  }

  async retrievePayment(providerPaymentId: string): Promise<RetrievePaymentResult> {
    const existing = this.payments.get(providerPaymentId);
    if (!existing) {
      return {
        providerPaymentId,
        status: "failed",
        amount: Decimal.ZERO,
        currency: "USD",
        failureCategory: "unknown",
        failureMessage: "Payment not found in mock provider",
      };
    }
    return {
      providerPaymentId,
      status: existing.status,
      amount: existing.amount,
      currency: existing.currency,
    };
  }

  async retrieveSubscription(providerSubscriptionId: string): Promise<RetrieveSubscriptionResult> {
    const existing = this.subscriptions.get(providerSubscriptionId);
    return {
      providerSubscriptionId,
      status: existing?.status ?? "cancelled",
    };
  }
}
