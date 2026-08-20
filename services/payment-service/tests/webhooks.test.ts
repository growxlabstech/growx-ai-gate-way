import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { PaymentService } from "../src/application/payment-service.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — Webhook Processing & Idempotency", () => {
  let paymentService: PaymentService;
  let paymentRepo: InMemoryPaymentRepository;
  let mockAdapter: MockPaymentProviderAdapter;

  beforeEach(() => {
    paymentRepo = new InMemoryPaymentRepository();
    mockAdapter = new MockPaymentProviderAdapter({
      webhookSecret: "whsec_test_secret_123",
    });
    paymentService = new PaymentService({
      repository: paymentRepo,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });
  });

  it("verifies signature and processes valid payment webhook", async () => {
    let capturedEvent: any = null;
    paymentService.onPaymentSuccess(async (evt) => {
      capturedEvent = evt;
    });

    const payloadObj = {
      id: "evt_valid_1",
      type: "payment.succeeded",
      data: {
        paymentId: "pi_test_valid",
        amount: "99.00",
        currency: "USD",
        status: "succeeded",
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = mockAdapter.signWebhook(payloadBytes);

    const result = await paymentService.processWebhook({
      provider: "mock",
      rawPayload: payloadBytes,
      signature,
    });

    expect(result.status).toBe("processed");
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.providerPaymentId).toBe("pi_test_valid");
  });

  it("rejects invalid webhook signatures", async () => {
    const payloadBytes = Buffer.from(JSON.stringify({ id: "evt_bad" }), "utf8");

    const result = await paymentService.processWebhook({
      provider: "mock",
      rawPayload: payloadBytes,
      signature: "t=1234567890,v1=forged_signature_hex",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid webhook signature");
  });

  it("idempotently handles duplicate webhooks (100 deliveries produce 1 execution)", async () => {
    let callCount = 0;
    paymentService.onPaymentSuccess(async () => {
      callCount++;
    });

    const payloadObj = {
      id: "evt_dup_100",
      type: "payment.succeeded",
      data: {
        paymentId: "pi_dup_test",
        amount: "50.00",
        currency: "USD",
        status: "succeeded",
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = mockAdapter.signWebhook(payloadBytes);

    // First execution
    const firstResult = await paymentService.processWebhook({
      provider: "mock",
      rawPayload: payloadBytes,
      signature,
    });
    expect(firstResult.status).toBe("processed");
    expect(callCount).toBe(1);

    // Subsequent 10 duplicate deliveries
    for (let i = 0; i < 10; i++) {
      const dupResult = await paymentService.processWebhook({
        provider: "mock",
        rawPayload: payloadBytes,
        signature,
      });
      expect(dupResult.status).toBe("duplicate");
    }

    expect(callCount).toBe(1);
  });
});
