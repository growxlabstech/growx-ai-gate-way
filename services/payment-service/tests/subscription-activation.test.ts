import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { CreditService, InMemoryCreditRepository } from "@growx/credit-service";
import { SubscriptionService, InMemorySubscriptionRepository } from "@growx/subscription-service";
import { PaymentService } from "../src/application/payment-service.js";
import { SubscriptionPaymentCoordinator } from "../src/application/subscription-payment-coordinator.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — Subscription Activation via Payments", () => {
  let paymentService: PaymentService;
  let subscriptionService: SubscriptionService;
  let creditService: CreditService;
  let coordinator: SubscriptionPaymentCoordinator;
  let paymentRepo: InMemoryPaymentRepository;
  let mockAdapter: MockPaymentProviderAdapter;
  let seededPlan: any;

  beforeEach(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    creditService = new CreditService(creditRepo);
    subscriptionService = new SubscriptionService(subRepo, creditService);

    mockAdapter = new MockPaymentProviderAdapter({
      webhookSecret: "whsec_act_secret",
    });

    paymentService = new PaymentService({
      repository: paymentRepo,
      subscriptionService,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });

    coordinator = new SubscriptionPaymentCoordinator(paymentService, subscriptionService);

    // Seed plan
    const plan = await subscriptionService.createPlan({ slug: "starter", displayName: "Starter Plan" });
    const version = await subscriptionService.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "19.00",
      creditGrantAmount: "50.00",
    });
    await subscriptionService.activatePlanVersion(version.id);
    seededPlan = plan;
  });

  it("does NOT activate subscription solely on checkout session creation (redirect is not proof)", async () => {
    await paymentService.createSubscriptionCheckout({
      organizationId: "org_redirect_only",
      planId: seededPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "ck_no_act_1",
    });

    // Customer simply returned to /success without webhook
    const activeSub = await subscriptionService.getActiveSubscription("org_redirect_only");
    expect(activeSub).toBeUndefined();
  });

  it("activates subscription and grants Phase-17 credits upon verified webhook", async () => {
    const session = await paymentService.createSubscriptionCheckout({
      organizationId: "org_webhook_act",
      planId: seededPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "ck_act_1",
    });

    // Simulate provider webhook for checkout.session.completed
    const payloadObj = {
      id: "evt_act_completed",
      type: "checkout.completed",
      data: {
        sessionId: session.providerSessionId,
        paymentId: "pi_real_success",
        amount: "19.00",
        currency: "USD",
        status: "succeeded",
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = mockAdapter.signWebhook(payloadBytes);

    await paymentService.processWebhook({
      provider: "mock",
      rawPayload: payloadBytes,
      signature,
    });

    // Verify subscription is active
    const activeSub = await subscriptionService.getActiveSubscription("org_webhook_act");
    expect(activeSub).toBeDefined();
    expect(activeSub!.status).toBe("active");
    expect(activeSub!.planId).toBe(seededPlan.id);

    // Verify wallet has received Phase-17 credit grant (50 credits)
    const wallet = await creditService.getOrCreateWallet("org_webhook_act");
    const balance = await creditService.getWalletBalance(wallet.id);
    expect(balance.total.toString()).toBe("50");
  });

  it("does not activate subscription on payment failure", async () => {
    const session = await paymentService.createSubscriptionCheckout({
      organizationId: "org_failed_act",
      planId: seededPlan.id,
      successReturnUrl: "https://app.growx.test/success",
      cancelReturnUrl: "https://app.growx.test/cancel",
      idempotencyKey: "ck_fail_1",
    });

    const payloadObj = {
      id: "evt_act_failed",
      type: "payment.failed",
      data: {
        sessionId: session.providerSessionId,
        paymentId: "pi_failed_1",
        failureCategory: "insufficient_funds",
        failureMessage: "Card was declined",
      },
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
    const signature = mockAdapter.signWebhook(payloadBytes);

    await paymentService.processWebhook({
      provider: "mock",
      rawPayload: payloadBytes,
      signature,
    });

    const activeSub = await subscriptionService.getActiveSubscription("org_failed_act");
    expect(activeSub).toBeUndefined();
  });
});
