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
import type { PaymentStatus, NormalizedPaymentEvent, PaymentFailureCategory } from "../types.js";
import { toMinorUnits, fromMinorUnits } from "../types.js";

export interface StripeAdapterOptions {
  apiKey?: string;
  webhookSecret?: string;
  apiVersion?: string;
}

export class StripeAdapter implements PaymentProviderAdapter {
  readonly providerName = "stripe";
  private readonly apiKey?: string | undefined;
  private readonly webhookSecret?: string | undefined;

  constructor(options?: StripeAdapterOptions) {
    this.apiKey = options?.apiKey ?? process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = options?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  }

  hasCredentials(): boolean {
    return Boolean(this.apiKey);
  }

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    if (!this.apiKey) {
      // Deterministic fixture for offline/credential-blocked environments
      return {
        providerCustomerId: `cus_sim_${input.organizationId.slice(0, 12)}`,
      };
    }

    const res = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: new URLSearchParams({
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
        "metadata[organizationId]": input.organizationId,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Stripe createCustomer failed (${res.status}): ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    return { providerCustomerId: data.id };
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    if (!this.apiKey) {
      const id = `cs_sim_${input.idempotencyKey}`;
      return {
        providerSessionId: id,
        checkoutUrl: `https://checkout.stripe.com/c/pay/${id}`,
      };
    }

    const minorAmount = toMinorUnits(input.amount, input.currency);
    const params = new URLSearchParams({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": minorAmount.toString(),
      "line_items[0][price_data][product_data][name]": input.purpose,
      "line_items[0][quantity]": "1",
      "metadata[organizationId]": input.organizationId,
      "metadata[idempotencyKey]": input.idempotencyKey,
      ...(input.providerCustomerId ? { customer: input.providerCustomerId } : {}),
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Stripe createCheckoutSession failed (${res.status}): ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    return {
      providerSessionId: data.id,
      checkoutUrl: data.url,
    };
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    if (!this.apiKey) {
      const id = `pi_sim_${input.idempotencyKey}`;
      return {
        providerPaymentId: id,
        status: "succeeded",
        clientSecret: `${id}_secret_sim`,
      };
    }

    const minorAmount = toMinorUnits(input.amount, input.currency);
    const params = new URLSearchParams({
      amount: minorAmount.toString(),
      currency: input.currency.toLowerCase(),
      "metadata[organizationId]": input.organizationId,
      ...(input.providerCustomerId ? { customer: input.providerCustomerId } : {}),
      ...(input.providerPaymentMethodId ? { payment_method: input.providerPaymentMethodId } : {}),
      ...(input.confirmImmediate ? { confirm: "true", off_session: "true" } : {}),
    });

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: params.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const stripeCode = data.error?.code;
      const failureCategory = this.mapStripeFailureCode(stripeCode);
      return {
        providerPaymentId: data.error?.payment_intent?.id ?? `pi_failed_${Date.now()}`,
        status: "failed",
        failureCategory,
        failureMessage: data.error?.message ?? "Stripe payment failed",
      };
    }

    const status = this.mapStripePaymentStatus(data.status);
    return {
      providerPaymentId: data.id,
      status,
      clientSecret: data.client_secret,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    if (!this.apiKey) {
      return {
        providerSubscriptionId: `sub_sim_${input.idempotencyKey}`,
        status: "active",
      };
    }

    // Direct Stripe subscription integration
    const res = await fetch("https://api.stripe.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: new URLSearchParams({
        customer: input.providerCustomerId,
        "metadata[organizationId]": input.organizationId,
        "metadata[planVersionId]": input.planVersionId,
      }).toString(),
    });

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status,
    };
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd?: boolean): Promise<CancelSubscriptionResult> {
    if (!this.apiKey) {
      return {
        providerSubscriptionId,
        status: atPeriodEnd ? "cancelling" : "canceled",
      };
    }

    const url = atPeriodEnd
      ? `https://api.stripe.com/v1/subscriptions/${providerSubscriptionId}`
      : `https://api.stripe.com/v1/subscriptions/${providerSubscriptionId}`;
    const method = atPeriodEnd ? "POST" : "DELETE";
    const body = atPeriodEnd ? new URLSearchParams({ cancel_at_period_end: "true" }).toString() : undefined;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ?? null,
    });

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (!this.apiKey) {
      return {
        providerRefundId: `re_sim_${input.idempotencyKey}`,
        status: "succeeded",
      };
    }

    const minorAmount = toMinorUnits(input.amount, input.currency);
    const res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: new URLSearchParams({
        payment_intent: input.providerPaymentId,
        amount: minorAmount.toString(),
        ...(input.reason ? { reason: "requested_by_customer" } : {}),
      }).toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        providerRefundId: `re_failed_${Date.now()}`,
        status: "failed",
      };
    }

    return {
      providerRefundId: data.id,
      status: data.status === "succeeded" ? "succeeded" : "pending",
    };
  }

  async verifyWebhook(
    payload: Uint8Array,
    signature: string,
    _headers?: Record<string, string>
  ): Promise<VerifyWebhookResult> {
    const secret = this.webhookSecret ?? "stripe_test_webhook_secret";

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
          provider: "stripe",
          eventId: "invalid",
          eventType: "unknown",
          status: "missing_signature",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    // 5-minute tolerance
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > 300) {
      return {
        verified: false,
        event: {
          provider: "stripe",
          eventId: "expired",
          eventType: "unknown",
          status: "timestamp_expired",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    const hmac = createHmac("sha256", secret);
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
          provider: "stripe",
          eventId: "invalid_sig",
          eventType: "unknown",
          status: "invalid_signature",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }

    try {
      const json = JSON.parse(Buffer.from(payload).toString("utf8"));
      const event = this.normalizeStripeEvent(json);
      return { verified: true, event };
    } catch {
      return {
        verified: false,
        event: {
          provider: "stripe",
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
    if (!this.apiKey) {
      return {
        providerPaymentId,
        status: "succeeded",
        amount: Decimal.from("10.00"),
        currency: "USD",
      };
    }

    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${providerPaymentId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        providerPaymentId,
        status: "failed",
        amount: Decimal.ZERO,
        currency: "USD",
        failureCategory: "unknown",
        failureMessage: data.error?.message ?? "Payment not found",
      };
    }

    const currency = (data.currency ?? "USD").toUpperCase();
    const amount = fromMinorUnits(data.amount ?? 0, currency);
    const status = this.mapStripePaymentStatus(data.status);

    return {
      providerPaymentId: data.id,
      status,
      amount,
      currency,
    };
  }

  async retrieveSubscription(providerSubscriptionId: string): Promise<RetrieveSubscriptionResult> {
    if (!this.apiKey) {
      return {
        providerSubscriptionId,
        status: "active",
      };
    }

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${providerSubscriptionId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status ?? "canceled",
    };
  }

  private mapStripePaymentStatus(stripeStatus: string): PaymentStatus {
    switch (stripeStatus) {
      case "succeeded":
        return "succeeded";
      case "requires_action":
      case "requires_confirmation":
        return "requires_action";
      case "requires_payment_method":
      case "canceled":
        return "failed";
      case "processing":
        return "pending";
      default:
        return "pending";
    }
  }

  private mapStripeFailureCode(code?: string): PaymentFailureCategory {
    switch (code) {
      case "card_declined":
      case "generic_decline":
        return "provider_decline";
      case "insufficient_funds":
        return "insufficient_funds";
      case "expired_card":
        return "expired_method";
      case "authentication_required":
        return "authentication_required";
      case "fraudulent":
        return "fraud_block";
      default:
        return "unknown";
    }
  }

  private normalizeStripeEvent(json: any): NormalizedPaymentEvent {
    const type: string = json.type ?? "";
    const obj = json.data?.object ?? {};
    let eventType: NormalizedPaymentEvent["eventType"] = "unknown";
    let status = "pending";
    let amount: Decimal | undefined;
    let currency: string | undefined;

    if (obj.currency) {
      currency = String(obj.currency).toUpperCase();
      if (obj.amount != null) {
        amount = fromMinorUnits(obj.amount, currency);
      }
    }

    if (type === "checkout.session.completed") {
      eventType = "checkout.completed";
      status = "succeeded";
      if (obj.amount_total != null && currency) {
        amount = fromMinorUnits(obj.amount_total, currency);
      }
    } else if (type === "payment_intent.succeeded") {
      eventType = "payment.succeeded";
      status = "succeeded";
    } else if (type === "payment_intent.payment_failed") {
      eventType = "payment.failed";
      status = "failed";
    } else if (type === "payment_intent.requires_action") {
      eventType = "payment.requires_action";
      status = "requires_action";
    } else if (type === "charge.refunded") {
      eventType = "refund.succeeded";
      status = "succeeded";
    }

    return {
      provider: "stripe",
      eventId: json.id ?? `evt_${Date.now()}`,
      eventType,
      providerPaymentId: obj.payment_intent ?? (type.startsWith("payment_intent") ? obj.id : undefined),
      providerCustomerId: obj.customer,
      providerSessionId: type.startsWith("checkout.session") ? obj.id : undefined,
      providerRefundId: obj.refunds?.data?.[0]?.id,
      amount,
      currency,
      status,
      failureCategory: obj.last_payment_error?.code ? this.mapStripeFailureCode(obj.last_payment_error.code) : undefined,
      failureMessage: obj.last_payment_error?.message,
      occurredAt: json.created ? new Date(json.created * 1000) : new Date(),
      metadata: obj.metadata ?? {},
    };
  }
}
