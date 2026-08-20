import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { PaymentService } from "../src/application/payment-service.js";
import { PaymentReconciliationWorker } from "../src/workers/reconciliation-worker.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — Payment Reconciliation", () => {
  let paymentService: PaymentService;
  let paymentRepo: InMemoryPaymentRepository;
  let mockAdapter: MockPaymentProviderAdapter;
  let worker: PaymentReconciliationWorker;

  beforeEach(() => {
    paymentRepo = new InMemoryPaymentRepository();
    mockAdapter = new MockPaymentProviderAdapter();
    paymentService = new PaymentService({
      repository: paymentRepo,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });
    worker = new PaymentReconciliationWorker({
      paymentService,
      repository: paymentRepo,
      staleThresholdMs: 0, // Immediately reconcile in test
    });
  });

  it("reconciles pending payment with provider API without recharging", async () => {
    const payment = await paymentService.createRenewalPayment({
      organizationId: "org_recon_1",
      subscriptionId: "sub_recon_1",
      amount: Decimal.from("75.00"),
      currency: "USD",
      idempotencyKey: "pi_recon_1",
    });

    // Manually set local status to pending to simulate a timeout during creation
    await paymentRepo.updatePayment(payment.id, { status: "pending" });

    // Ensure mock provider has the payment as succeeded
    mockAdapter.payments.set(payment.providerPaymentId!, {
      id: payment.providerPaymentId!,
      status: "succeeded",
      amount: Decimal.from("75.00"),
      currency: "USD",
    });

    // Run reconciliation
    const reconciled = await paymentService.reconcilePayment(payment.id);
    expect(reconciled.status).toBe("succeeded");
    expect(reconciled.capturedAt).toBeDefined();
  });

  it("processes batch of pending payments through ReconciliationWorker", async () => {
    // Seed 3 pending payments
    for (let i = 1; i <= 3; i++) {
      const p = await paymentService.createRenewalPayment({
        organizationId: "org_batch",
        subscriptionId: `sub_${i}`,
        amount: Decimal.from("20.00"),
        currency: "USD",
        idempotencyKey: `pi_batch_${i}`,
      });
      await paymentRepo.updatePayment(p.id, {
        status: "pending",
        createdAt: new Date(Date.now() - 60000),
      });
      mockAdapter.payments.set(p.providerPaymentId!, {
        id: p.providerPaymentId!,
        status: "succeeded",
        amount: Decimal.from("20.00"),
        currency: "USD",
      });
    }

    const result = await worker.runOnce();
    expect(result.processed).toBe(3);
    expect(result.corrected).toBe(3);
    expect(result.errors).toBe(0);

    const list = await paymentService.listPayments("org_batch");
    expect(list.every((p) => p.status === "succeeded")).toBe(true);
  });
});
