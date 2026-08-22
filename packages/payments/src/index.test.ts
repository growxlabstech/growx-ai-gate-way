import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  toMinorUnits,
  fromMinorUnits,
  getCurrencyDecimalPlaces,
  MockPaymentProviderAdapter,
  StripeAdapter,
  RazorpayAdapter,
} from "./index.js";

describe("Phase 19 — Currency & Minor Unit Conversions", () => {
  it("handles standard 2-decimal currencies (USD, EUR, GBP)", () => {
    expect(getCurrencyDecimalPlaces("USD")).toBe(2);
    expect(getCurrencyDecimalPlaces("EUR")).toBe(2);

    const d = Decimal.from("29.99");
    const minor = toMinorUnits(d, "USD");
    expect(minor).toBe(2999n);

    const back = fromMinorUnits(minor, "USD");
    expect(back.toString()).toBe("29.99");
  });

  it("handles zero-decimal currencies (JPY, KRW, VND)", () => {
    expect(getCurrencyDecimalPlaces("JPY")).toBe(0);
    expect(getCurrencyDecimalPlaces("KRW")).toBe(0);

    const d = Decimal.from("5000");
    const minor = toMinorUnits(d, "JPY");
    expect(minor).toBe(5000n);

    const back = fromMinorUnits(minor, "JPY");
    expect(back.toString()).toBe("5000");
  });

  it("handles 3-decimal currencies (KWD, BHD)", () => {
    expect(getCurrencyDecimalPlaces("KWD")).toBe(3);
    expect(getCurrencyDecimalPlaces("BHD")).toBe(3);

    const d = Decimal.from("12.345");
    const minor = toMinorUnits(d, "KWD");
    expect(minor).toBe(12345n);

    const back = fromMinorUnits(minor, "KWD");
    expect(back.toString()).toBe("12.345");
  });

  it("converts negative or fractional cents safely without float drift", () => {
    const d = Decimal.from("0.05");
    expect(toMinorUnits(d, "USD")).toBe(5n);
    expect(fromMinorUnits(5n, "USD").toString()).toBe("0.05");
  });
});

describe("Phase 19 — MockPaymentProviderAdapter", () => {
  it("creates customer, checkout session, and payment intent", async () => {
    const adapter = new MockPaymentProviderAdapter();

    const customer = await adapter.createCustomer({
      organizationId: "org_123",
      email: "billing@acme.test",
    });
    expect(customer.providerCustomerId).toContain("mock_cus_org_123");

    const checkout = await adapter.createCheckoutSession({
      organizationId: "org_123",
      amount: Decimal.from("49.00"),
      currency: "USD",
      purpose: "subscription_start",
      successUrl: "https://app.growx.test/success",
      cancelUrl: "https://app.growx.test/cancel",
      idempotencyKey: "idem_ck_1",
    });
    expect(checkout.providerSessionId).toBe("mock_cs_idem_ck_1");
    expect(checkout.checkoutUrl).toContain("mock_cs_idem_ck_1");

    const intent = await adapter.createPaymentIntent({
      organizationId: "org_123",
      amount: Decimal.from("49.00"),
      currency: "USD",
      purpose: "subscription_renewal",
      idempotencyKey: "idem_pi_1",
    });
    expect(intent.status).toBe("succeeded");
    expect(intent.providerPaymentId).toBe("mock_pi_idem_pi_1");
  });

  it("signs and verifies webhooks correctly", async () => {
    const adapter = new MockPaymentProviderAdapter({
      webhookSecret: "secret_key_abc",
    });

    const payloadObj = {
      id: "evt_123",
      type: "payment.succeeded",
      data: {
        paymentId: "pi_test_123",
        amount: "49.00",
        currency: "USD",
        status: "succeeded",
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = adapter.signWebhook(payloadBytes);

    const result = await adapter.verifyWebhook(payloadBytes, signature);
    expect(result.verified).toBe(true);
    expect(result.event.provider).toBe("mock");
    expect(result.event.eventType).toBe("payment.succeeded");
    expect(result.event.providerPaymentId).toBe("pi_test_123");
    expect(result.event.amount?.toString()).toBe("49");
  });

  it("rejects invalid webhook signatures", async () => {
    const adapter = new MockPaymentProviderAdapter({
      webhookSecret: "secret_key_abc",
    });

    const payloadBytes = Buffer.from(JSON.stringify({ id: "evt_1" }), "utf8");
    const result = await adapter.verifyWebhook(
      payloadBytes,
      "t=1234567890,v1=bad_hex_signature",
    );
    expect(result.verified).toBe(false);
  });

  it("handles refunds and payment retrieval", async () => {
    const adapter = new MockPaymentProviderAdapter();
    await adapter.createPaymentIntent({
      organizationId: "org_1",
      amount: Decimal.from("100.00"),
      currency: "USD",
      purpose: "test",
      idempotencyKey: "pi_key_1",
    });

    const refund = await adapter.refundPayment({
      providerPaymentId: "mock_pi_pi_key_1",
      amount: Decimal.from("50.00"),
      currency: "USD",
      idempotencyKey: "ref_key_1",
    });
    expect(refund.status).toBe("succeeded");

    const retrieved = await adapter.retrievePayment("mock_pi_pi_key_1");
    expect(retrieved.status).toBe("succeeded");
    expect(retrieved.amount.toString()).toBe("100");
  });
});

describe("Phase 19 — StripeAdapter Webhook Verification", () => {
  it("normalizes Stripe webhook events", async () => {
    const adapter = new StripeAdapter({
      webhookSecret: "whsec_stripe_test",
    });

    const payloadObj = {
      id: "evt_stripe_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_stripe_123",
          amount: 4900,
          currency: "usd",
          status: "succeeded",
        },
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const ts = Math.floor(Date.now() / 1000);
    const hmac = require("node:crypto").createHmac(
      "sha256",
      "whsec_stripe_test",
    );
    hmac.update(`${ts}.`);
    hmac.update(payloadBytes);
    const sig = `t=${ts},v1=${hmac.digest("hex")}`;

    const result = await adapter.verifyWebhook(payloadBytes, sig);
    expect(result.verified).toBe(true);
    expect(result.event.provider).toBe("stripe");
    expect(result.event.eventType).toBe("payment.succeeded");
    expect(result.event.providerPaymentId).toBe("pi_stripe_123");
    expect(result.event.amount?.toString()).toBe("49");
    expect(result.event.currency).toBe("USD");
  });
});

describe("Phase 19 — RazorpayAdapter Webhook Verification", () => {
  it("normalizes Razorpay webhook events", async () => {
    const adapter = new RazorpayAdapter({
      webhookSecret: "rzp_whsec_test",
    });

    const payloadObj = {
      id: "evt_rzp_1",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_123",
            amount: 49900,
            currency: "INR",
            status: "captured",
          },
        },
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const hmac = require("node:crypto").createHmac("sha256", "rzp_whsec_test");
    hmac.update(payloadBytes);
    const sig = hmac.digest("hex");

    const result = await adapter.verifyWebhook(payloadBytes, sig);
    expect(result.verified).toBe(true);
    expect(result.event.provider).toBe("razorpay");
    expect(result.event.eventType).toBe("payment.succeeded");
    expect(result.event.providerPaymentId).toBe("pay_rzp_123");
    expect(result.event.amount?.toString()).toBe("499");
    expect(result.event.currency).toBe("INR");
  });
});
