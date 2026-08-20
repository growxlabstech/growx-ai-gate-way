import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { PaymentService } from "../src/application/payment-service.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — Refunds & Amount Invariants", () => {
  let paymentService: PaymentService;
  let paymentRepo: InMemoryPaymentRepository;
  let mockAdapter: MockPaymentProviderAdapter;

  beforeEach(() => {
    paymentRepo = new InMemoryPaymentRepository();
    mockAdapter = new MockPaymentProviderAdapter();
    paymentService = new PaymentService({
      repository: paymentRepo,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });
  });

  async function seedSucceededPayment(amount = "100.00", orgId = "org_refund_1") {
    const payment = await paymentService.createRenewalPayment({
      organizationId: orgId,
      subscriptionId: "sub_123",
      amount: Decimal.from(amount),
      currency: "USD",
      idempotencyKey: `pay_seed_${Date.now()}_${Math.random()}`,
    });
    return payment;
  }

  it("processes a full refund successfully", async () => {
    const payment = await seedSucceededPayment("100.00");

    const refund = await paymentService.refundPayment({
      paymentId: payment.id,
      organizationId: "org_refund_1",
      reason: "Customer request",
      createdBy: "ops_admin_1",
      idempotencyKey: "ref_full_1",
    });

    expect(refund.status).toBe("succeeded");
    expect(refund.amount.toString()).toBe("100");

    const updatedPayment = await paymentService.getPayment("org_refund_1", payment.id);
    expect(updatedPayment!.status).toBe("refunded");
    expect(updatedPayment!.refundedAmount.toString()).toBe("100");
  });

  it("processes multiple partial refunds accurately", async () => {
    const payment = await seedSucceededPayment("100.00");

    const ref1 = await paymentService.refundPayment({
      paymentId: payment.id,
      organizationId: "org_refund_1",
      amount: Decimal.from("30.00"),
      reason: "Partial discount",
      createdBy: "ops_admin_1",
      idempotencyKey: "ref_part_1",
    });
    expect(ref1.status).toBe("succeeded");

    let p = await paymentService.getPayment("org_refund_1", payment.id);
    expect(p!.status).toBe("partially_refunded");
    expect(p!.refundedAmount.toString()).toBe("30");

    const ref2 = await paymentService.refundPayment({
      paymentId: payment.id,
      organizationId: "org_refund_1",
      amount: Decimal.from("70.00"),
      reason: "Remaining balance",
      createdBy: "ops_admin_1",
      idempotencyKey: "ref_part_2",
    });
    expect(ref2.status).toBe("succeeded");

    p = await paymentService.getPayment("org_refund_1", payment.id);
    expect(p!.status).toBe("refunded");
    expect(p!.refundedAmount.toString()).toBe("100");
  });

  it("rejects refund exceeding captured payment amount", async () => {
    const payment = await seedSucceededPayment("100.00");

    await expect(
      paymentService.refundPayment({
        paymentId: payment.id,
        organizationId: "org_refund_1",
        amount: Decimal.from("101.00"),
        reason: "Excess refund",
        createdBy: "ops_admin_1",
        idempotencyKey: "ref_excess_1",
      })
    ).rejects.toThrow("exceeds available refundable amount");
  });

  it("enforces refund idempotency", async () => {
    const payment = await seedSucceededPayment("50.00");

    const ref1 = await paymentService.refundPayment({
      paymentId: payment.id,
      organizationId: "org_refund_1",
      amount: Decimal.from("25.00"),
      reason: "First call",
      createdBy: "ops_admin_1",
      idempotencyKey: "same_ref_key",
    });

    const ref2 = await paymentService.refundPayment({
      paymentId: payment.id,
      organizationId: "org_refund_1",
      amount: Decimal.from("25.00"),
      reason: "Duplicate call",
      createdBy: "ops_admin_1",
      idempotencyKey: "same_ref_key",
    });

    expect(ref1.id).toBe(ref2.id);

    const p = await paymentService.getPayment("org_refund_1", payment.id);
    expect(p!.refundedAmount.toString()).toBe("25"); // Not 50
  });

  it("enforces tenant isolation (Org A cannot refund Org B payment)", async () => {
    const payment = await seedSucceededPayment("50.00", "org_a");

    await expect(
      paymentService.refundPayment({
        paymentId: payment.id,
        organizationId: "org_b",
        reason: "Attack attempt",
        createdBy: "attacker",
        idempotencyKey: "ref_attack",
      })
    ).rejects.toThrow("Payment does not belong to this organization");
  });
});
