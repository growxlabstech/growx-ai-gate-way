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
import type {
  PaymentStatus,
  NormalizedPaymentEvent,
  PaymentFailureCategory,
} from "../types.js";
import { toMinorUnits, fromMinorUnits } from "../types.js";

export interface RazorpayAdapterOptions {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export class RazorpayAdapter implements PaymentProviderAdapter {
  readonly providerName = "razorpay";
  private readonly keyId?: string | undefined;
  private readonly keySecret?: string | undefined;
  private readonly webhookSecret?: string | undefined;

  constructor(options?: RazorpayAdapterOptions) {
    this.keyId = options?.keyId ?? process.env.RAZORPAY_KEY_ID;
    this.keySecret = options?.keySecret ?? process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret =
      options?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  hasCredentials(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
  }

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerResult> {
    if (!this.hasCredentials()) {
      return {
        providerCustomerId: `cust_sim_${input.organizationId.slice(0, 12)}`,
      };
    }

    const res = await fetch("https://api.razorpay.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name ?? input.organizationId,
        email: input.email,
        notes: { organizationId: input.organizationId },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Razorpay createCustomer failed (${res.status}): ${JSON.stringify(err)}`,
      );
    }

    const data = await res.json();
    return { providerCustomerId: data.id };
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionResult> {
    if (!this.hasCredentials()) {
      const orderId = `order_sim_${input.idempotencyKey}`;
      return {
        providerSessionId: orderId,
        checkoutUrl: `https://pages.razorpay.com/pay/${orderId}`,
      };
    }

    const minorAmount = toMinorUnits(input.amount, input.currency);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(minorAmount),
        currency: input.currency.toUpperCase(),
        receipt: input.idempotencyKey.slice(0, 40),
        notes: {
          organizationId: input.organizationId,
          purpose: input.purpose,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Razorpay createOrder failed (${res.status}): ${JSON.stringify(err)}`,
      );
    }

    const data = await res.json();
    return {
      providerSessionId: data.id,
      checkoutUrl: `https://pages.razorpay.com/pay/${data.id}`,
    };
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResult> {
    if (!this.hasCredentials()) {
      const payId = `pay_sim_${input.idempotencyKey}`;
      return {
        providerPaymentId: payId,
        status: "succeeded",
      };
    }

    // Razorpay orders represent payment intents before capture
    const minorAmount = toMinorUnits(input.amount, input.currency);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(minorAmount),
        currency: input.currency.toUpperCase(),
        receipt: input.idempotencyKey.slice(0, 40),
        notes: { organizationId: input.organizationId },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        providerPaymentId: `pay_failed_${Date.now()}`,
        status: "failed",
        failureCategory: "provider_error",
        failureMessage:
          data.error?.description ?? "Razorpay order creation failed",
      };
    }

    return {
      providerPaymentId: data.id,
      status: "pending",
    };
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> {
    if (!this.hasCredentials()) {
      return {
        providerSubscriptionId: `sub_rzp_sim_${input.idempotencyKey}`,
        status: "active",
      };
    }

    const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: input.planVersionId,
        customer_id: input.providerCustomerId,
        total_count: 12,
        notes: { organizationId: input.organizationId },
      }),
    });

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status,
    };
  }

  async cancelSubscription(
    providerSubscriptionId: string,
    atPeriodEnd?: boolean,
  ): Promise<CancelSubscriptionResult> {
    if (!this.hasCredentials()) {
      return {
        providerSubscriptionId,
        status: "cancelled",
      };
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${providerSubscriptionId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd ? 1 : 0 }),
      },
    );

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status ?? "cancelled",
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (!this.hasCredentials()) {
      return {
        providerRefundId: `rfnd_sim_${input.idempotencyKey}`,
        status: "succeeded",
      };
    }

    const minorAmount = toMinorUnits(input.amount, input.currency);
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${input.providerPaymentId}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(minorAmount),
          notes: { reason: input.reason ?? "customer_requested" },
        }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return {
        providerRefundId: `rfnd_failed_${Date.now()}`,
        status: "failed",
      };
    }

    return {
      providerRefundId: data.id,
      status: data.status === "processed" ? "succeeded" : "pending",
    };
  }

  async verifyWebhook(
    payload: Uint8Array,
    signature: string,
    _headers?: Record<string, string>,
  ): Promise<VerifyWebhookResult> {
    const secret = this.webhookSecret ?? "rzp_test_webhook_secret";

    const hmac = createHmac("sha256", secret);
    hmac.update(payload);
    const expectedHex = hmac.digest("hex");

    let verified = false;
    try {
      const computedBuf = Buffer.from(expectedHex, "hex");
      const suppliedBuf = Buffer.from(signature, "hex");
      verified =
        computedBuf.length === suppliedBuf.length &&
        timingSafeEqual(computedBuf, suppliedBuf);
    } catch {
      verified = false;
    }

    if (!verified) {
      return {
        verified: false,
        event: {
          provider: "razorpay",
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
      const event = this.normalizeRazorpayEvent(json);
      return { verified: true, event };
    } catch {
      return {
        verified: false,
        event: {
          provider: "razorpay",
          eventId: "malformed_json",
          eventType: "unknown",
          status: "malformed_payload",
          occurredAt: new Date(),
          metadata: {},
        },
      };
    }
  }

  async retrievePayment(
    providerPaymentId: string,
  ): Promise<RetrievePaymentResult> {
    if (!this.hasCredentials()) {
      return {
        providerPaymentId,
        status: "succeeded",
        amount: Decimal.from("10.00"),
        currency: "INR",
      };
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${providerPaymentId}`,
      {
        headers: { Authorization: this.getAuthHeader() },
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return {
        providerPaymentId,
        status: "failed",
        amount: Decimal.ZERO,
        currency: "INR",
        failureCategory: "unknown",
        failureMessage: data.error?.description ?? "Payment not found",
      };
    }

    const currency = (data.currency ?? "INR").toUpperCase();
    const amount = fromMinorUnits(data.amount ?? 0, currency);
    const status: PaymentStatus =
      data.status === "captured"
        ? "succeeded"
        : data.status === "failed"
          ? "failed"
          : "pending";

    return {
      providerPaymentId: data.id,
      status,
      amount,
      currency,
    };
  }

  async retrieveSubscription(
    providerSubscriptionId: string,
  ): Promise<RetrieveSubscriptionResult> {
    if (!this.hasCredentials()) {
      return {
        providerSubscriptionId,
        status: "active",
      };
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${providerSubscriptionId}`,
      {
        headers: { Authorization: this.getAuthHeader() },
      },
    );

    const data = await res.json();
    return {
      providerSubscriptionId: data.id,
      status: data.status ?? "cancelled",
    };
  }

  private normalizeRazorpayEvent(json: any): NormalizedPaymentEvent {
    const rawEvent: string = json.event ?? "";
    const paymentEntity = json.payload?.payment?.entity ?? {};
    const refundEntity = json.payload?.refund?.entity ?? {};
    const orderEntity = json.payload?.order?.entity ?? {};

    let eventType: NormalizedPaymentEvent["eventType"] = "unknown";
    let status = "pending";
    let amount: Decimal | undefined;
    let currency: string | undefined;

    const currencyStr =
      paymentEntity.currency ?? orderEntity.currency ?? refundEntity.currency;
    if (currencyStr) {
      currency = String(currencyStr).toUpperCase();
      const amountMinor =
        paymentEntity.amount ?? orderEntity.amount ?? refundEntity.amount;
      if (amountMinor != null) {
        amount = fromMinorUnits(amountMinor, currency);
      }
    }

    if (rawEvent === "payment.captured" || rawEvent === "order.paid") {
      eventType = "payment.succeeded";
      status = "succeeded";
    } else if (rawEvent === "payment.failed") {
      eventType = "payment.failed";
      status = "failed";
    } else if (rawEvent === "payment.authorized") {
      eventType = "payment.requires_action";
      status = "requires_action";
    } else if (rawEvent === "refund.processed") {
      eventType = "refund.succeeded";
      status = "succeeded";
    }

    let failureCategory: PaymentFailureCategory | undefined;
    if (paymentEntity.error_code) {
      failureCategory = "provider_decline";
    }

    return {
      provider: "razorpay",
      eventId: json.id ?? `rzp_evt_${Date.now()}`,
      eventType,
      providerPaymentId: paymentEntity.id ?? orderEntity.id,
      providerCustomerId: paymentEntity.customer_id,
      providerSessionId: orderEntity.id,
      providerRefundId: refundEntity.id,
      amount,
      currency,
      status,
      failureCategory,
      failureMessage: paymentEntity.error_description,
      occurredAt: json.created_at
        ? new Date(json.created_at * 1000)
        : new Date(),
      metadata: paymentEntity.notes ?? orderEntity.notes ?? {},
    };
  }
}
