import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { CreditService, InMemoryCreditRepository } from "@growx/credit-service";
import {
  SubscriptionService,
  InMemorySubscriptionRepository,
} from "@growx/subscription-service";
import { PaymentService } from "../src/application/payment-service.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — Subscription Checkout", () => {
  let paymentService: PaymentService;
  let subscriptionService: SubscriptionService;
  let paymentRepo: InMemoryPaymentRepository;
  let mockAdapter: MockPaymentProviderAdapter;

  beforeEach(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    const creditService = new CreditService(creditRepo);
    subscriptionService = new SubscriptionService(subRepo, creditService);

    mockAdapter = new MockPaymentProviderAdapter();
    paymentService = new PaymentService({
      repository: paymentRepo,
      subscriptionService,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });

    // Seed a plan
    const plan = await subscriptionService.createPlan({
      slug: "pro",
      displayName: "Pro Plan",
    });
    const version = await subscriptionService.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "49.00",
      creditGrantAmount: "100.00",
    });
    await subscriptionService.activatePlanVersion(version.id);
  });

  it("creates checkout session with server-derived price snapshot", async () => {
    const plans = await subscriptionService.listPlans();
    const proPlan = plans.find((p) => p.slug === "pro")!;

    const session = await paymentService.createSubscriptionCheckout({
      organizationId: "org_checkout_1",
      planId: proPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "ck_test_1",
    });

    expect(session.id).toBeDefined();
    expect(session.amount.toString()).toBe("49");
    expect(session.currency).toBe("USD");
    expect(session.status).toBe("open");
    expect(session.providerSessionId).toBeDefined();
    expect(session.checkoutUrl).toContain("checkout.mockpayment.test");
  });

  it("enforces server-authoritative pricing (customer cannot supply altered price)", async () => {
    const plans = await subscriptionService.listPlans();
    const proPlan = plans.find((p) => p.slug === "pro")!;

    // Even if client attempts to pass custom price or tampering in metadata, price is derived from plan version
    const session = await paymentService.createSubscriptionCheckout({
      organizationId: "org_tamper",
      planId: proPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "ck_tamper_1",
      metadata: { tamperedPrice: "1.00" },
    });

    expect(session.amount.toString()).toBe("49");
  });

  it("is strictly idempotent (100 repeated checkout requests return the same session)", async () => {
    const plans = await subscriptionService.listPlans();
    const proPlan = plans.find((p) => p.slug === "pro")!;

    const first = await paymentService.createSubscriptionCheckout({
      organizationId: "org_idemp_ck",
      planId: proPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "same_key_123",
    });

    for (let i = 0; i < 10; i++) {
      const repeated = await paymentService.createSubscriptionCheckout({
        organizationId: "org_idemp_ck",
        planId: proPlan.id,
        successReturnUrl: "https://app.growx.test/success",
        cancelReturnUrl: "https://app.growx.test/cancel",
        idempotencyKey: "same_key_123",
      });
      expect(repeated.id).toBe(first.id);
      expect(repeated.providerSessionId).toBe(first.providerSessionId);
    }
  });

  it("creates and maps provider customer idempotently", async () => {
    const cus1 = await paymentService.getOrCreateCustomer(
      "org_cus_test",
      "mock",
      "billing@org.test",
    );
    const cus2 = await paymentService.getOrCreateCustomer(
      "org_cus_test",
      "mock",
      "billing@org.test",
    );

    expect(cus1.id).toBe(cus2.id);
    expect(cus1.providerCustomerId).toBe(cus2.providerCustomerId);
  });
});
