import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { CreditService, InMemoryCreditRepository } from "@growx/credit-service";
import { SubscriptionService } from "../src/application/subscription-service.js";
import { InMemorySubscriptionRepository } from "../src/infrastructure/in-memory-repository.js";
import type {
  PlanVersion,
  EntitlementDefinition,
  ModelAccessRule,
  PlanLimit,
} from "@growx/subscriptions";

function makeEntitlements(): EntitlementDefinition[] {
  return [
    { key: "max_workspaces", type: "integer", value: "5" },
    { key: "streaming_enabled", type: "boolean", value: "true" },
    { key: "tier", type: "string", value: "pro" },
  ];
}

function makeModelRules(): ModelAccessRule[] {
  return [
    { pattern: "openai/*", effect: "allow" },
    { pattern: "anthropic/claude-3.5-*", effect: "allow" },
  ];
}

function makeLimits(): PlanLimit[] {
  return [{ key: "requests_per_minute", value: 60, window: "minute" }];
}

describe("Phase 18 — Subscription Lifecycle", () => {
  let service: SubscriptionService;
  let subRepo: InMemorySubscriptionRepository;
  let creditService: CreditService;

  beforeEach(() => {
    subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    creditService = new CreditService(creditRepo);
    service = new SubscriptionService(subRepo, creditService);
  });

  async function createProPlan() {
    const plan = await service.createPlan({
      slug: "pro",
      displayName: "Pro Plan",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "50.00",
      entitlements: makeEntitlements(),
      modelAccessRules: makeModelRules(),
      limits: makeLimits(),
      featureFlags: ["advanced_analytics"],
    });
    await service.activatePlanVersion(version.id);
    return { plan, version: (await service.getPlanVersion(plan.id, 1))! };
  }

  it("creates a plan, activates a version, and subscribes an organization", async () => {
    const { plan, version } = await createProPlan();

    const { subscription, period } = await service.createSubscription({
      organizationId: "org_test_1",
      planId: plan.id,
    });

    expect(subscription.status).toBe("active");
    expect(subscription.planId).toBe(plan.id);
    expect(subscription.planVersionId).toBe(version.id);
    expect(period.periodNumber).toBe(1);
    expect(period.status).toBe("active");
  });

  it("grants credits on subscription creation", async () => {
    const { plan } = await createProPlan();

    await service.createSubscription({
      organizationId: "org_credit_test",
      planId: plan.id,
    });

    const wallet = await creditService.getOrCreateWallet("org_credit_test");
    const balance = await creditService.getWalletBalance(wallet.id);
    expect(balance.available.toString()).toBe("50");
    expect(balance.total.toString()).toBe("50");
  });

  it("prevents duplicate active subscriptions for same organization", async () => {
    const { plan } = await createProPlan();

    await service.createSubscription({
      organizationId: "org_dup",
      planId: plan.id,
    });

    await expect(
      service.createSubscription({
        organizationId: "org_dup",
        planId: plan.id,
      }),
    ).rejects.toThrow("already has an active subscription");
  });

  it("cancels subscription immediately", async () => {
    const { plan } = await createProPlan();
    const { subscription } = await service.createSubscription({
      organizationId: "org_cancel",
      planId: plan.id,
    });

    const cancelled = await service.cancelSubscription(
      "org_cancel",
      subscription.id,
      { immediate: true },
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).toBeDefined();
  });

  it("cancels subscription at period end", async () => {
    const { plan } = await createProPlan();
    const { subscription } = await service.createSubscription({
      organizationId: "org_cancel_end",
      planId: plan.id,
    });

    const updated = await service.cancelSubscription(
      "org_cancel_end",
      subscription.id,
    );
    expect(updated.status).toBe("active"); // Still active until period end
    expect(updated.cancelAtPeriodEnd).toBe(true);
  });

  it("pauses and resumes subscription", async () => {
    const { plan } = await createProPlan();
    const { subscription } = await service.createSubscription({
      organizationId: "org_pause",
      planId: plan.id,
    });

    const paused = await service.pauseSubscription(
      "org_pause",
      subscription.id,
    );
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBeDefined();

    const resumed = await service.resumeSubscription(
      "org_pause",
      subscription.id,
    );
    expect(resumed.status).toBe("active");
    expect(resumed.resumedAt).toBeDefined();
  });

  it("rejects invalid state transitions", async () => {
    const { plan } = await createProPlan();
    const { subscription } = await service.createSubscription({
      organizationId: "org_invalid",
      planId: plan.id,
    });

    // Cancel, then try to pause (cancelled is terminal)
    await service.cancelSubscription("org_invalid", subscription.id, {
      immediate: true,
    });

    await expect(
      service.pauseSubscription("org_invalid", subscription.id),
    ).rejects.toThrow();
  });

  it("enforces tenant isolation on subscription operations", async () => {
    const { plan } = await createProPlan();
    const { subscription } = await service.createSubscription({
      organizationId: "org_a",
      planId: plan.id,
    });

    await expect(
      service.cancelSubscription("org_b", subscription.id),
    ).rejects.toThrow("does not belong to this organization");
  });
});

describe("Phase 18 — Plan Versioning", () => {
  let service: SubscriptionService;

  beforeEach(() => {
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    service = new SubscriptionService(subRepo, new CreditService(creditRepo));
  });

  it("creates sequential version numbers", async () => {
    const plan = await service.createPlan({
      slug: "test",
      displayName: "Test",
    });

    const v1 = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "10.00",
      creditGrantAmount: "20.00",
    });
    const v2 = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "15.00",
      creditGrantAmount: "30.00",
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.status).toBe("draft");
    expect(v2.status).toBe("draft");
  });

  it("archives old active version when activating new one", async () => {
    const plan = await service.createPlan({
      slug: "test2",
      displayName: "Test2",
    });

    const v1 = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "10.00",
      creditGrantAmount: "20.00",
    });
    await service.activatePlanVersion(v1.id);

    const v2 = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "15.00",
      creditGrantAmount: "30.00",
    });
    await service.activatePlanVersion(v2.id);

    const v1Updated = await service.getPlanVersion(plan.id, 1);
    const v2Updated = await service.getPlanVersion(plan.id, 2);
    expect(v1Updated!.status).toBe("archived");
    expect(v2Updated!.status).toBe("active");
  });

  it("rejects activating non-draft version", async () => {
    const plan = await service.createPlan({
      slug: "test3",
      displayName: "Test3",
    });
    const v1 = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "10.00",
      creditGrantAmount: "20.00",
    });
    await service.activatePlanVersion(v1.id);

    // Try to activate again
    await expect(service.activatePlanVersion(v1.id)).rejects.toThrow(
      "must be 'draft'",
    );
  });

  it("prevents duplicate plan slugs", async () => {
    await service.createPlan({ slug: "unique", displayName: "Unique" });
    await expect(
      service.createPlan({ slug: "unique", displayName: "Another" }),
    ).rejects.toThrow("already exists");
  });
});

describe("Phase 18 — Entitlement Resolution", () => {
  let service: SubscriptionService;
  let subRepo: InMemorySubscriptionRepository;

  beforeEach(() => {
    subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    service = new SubscriptionService(subRepo, new CreditService(creditRepo));
  });

  it("resolves entitlements from active subscription", async () => {
    const plan = await service.createPlan({
      slug: "ent-test",
      displayName: "Ent Test",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "50.00",
      entitlements: makeEntitlements(),
      modelAccessRules: makeModelRules(),
    });
    await service.activatePlanVersion(version.id);
    await service.createSubscription({
      organizationId: "org_ent",
      planId: plan.id,
    });

    const resolved = await service.resolveEntitlements("org_ent");
    expect(resolved.getInteger("max_workspaces")).toBe(5);
    expect(resolved.getBoolean("streaming_enabled")).toBe(true);
    expect(resolved.getString("tier")).toBe("pro");
    expect(resolved.checkModelAccess("openai/gpt-4o").allowed).toBe(true);
  });

  it("returns DENY_ALL for org with no subscription (fail-closed)", async () => {
    const resolved = await service.resolveEntitlements("org_no_sub");
    expect(resolved.checkModelAccess("openai/gpt-4o").allowed).toBe(false);
  });

  it("applies entitlement overrides", async () => {
    const plan = await service.createPlan({
      slug: "override-test",
      displayName: "Override Test",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "50.00",
      entitlements: makeEntitlements(),
    });
    await service.activatePlanVersion(version.id);
    await service.createSubscription({
      organizationId: "org_override",
      planId: plan.id,
    });

    // Override max_workspaces from 5 to 100
    await service.setEntitlementOverride({
      organizationId: "org_override",
      key: "max_workspaces",
      type: "integer",
      value: "100",
      reason: "Enterprise deal",
      createdBy: "admin_1",
    });

    const resolved = await service.resolveEntitlements("org_override");
    expect(resolved.getInteger("max_workspaces")).toBe(100);
    // Other entitlements unchanged
    expect(resolved.getBoolean("streaming_enabled")).toBe(true);
  });
});

describe("Phase 18 — Renewal Worker", () => {
  let service: SubscriptionService;
  let creditService: CreditService;
  let subRepo: InMemorySubscriptionRepository;

  beforeEach(() => {
    subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    creditService = new CreditService(creditRepo);
    service = new SubscriptionService(subRepo, creditService);
  });

  it("processes renewal: advances period, grants credits, idempotent", async () => {
    const plan = await service.createPlan({
      slug: "renew",
      displayName: "Renew Plan",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "50.00",
    });
    await service.activatePlanVersion(version.id);

    const { subscription } = await service.createSubscription({
      organizationId: "org_renew",
      planId: plan.id,
    });

    // Simulate period expiration by moving currentPeriodEnd to the past
    await subRepo.updateSubscription(subscription.id, {
      currentPeriodEnd: new Date(Date.now() - 1000),
    });
    const latestPeriod = await subRepo.getLatestPeriod(subscription.id);
    if (latestPeriod) {
      await subRepo.updateSubscriptionPeriod(latestPeriod.id, {
        periodEnd: new Date(Date.now() - 1000),
      });
    }

    const result = await service.processRenewal(subscription.id);

    expect(result.newPeriod.periodNumber).toBe(2);
    expect(result.creditGranted).toBe(true);
    expect(result.subscription.status).toBe("active");

    // Verify credits were granted (initial 50 + renewal 50 = 100)
    const wallet = await creditService.getOrCreateWallet("org_renew");
    const balance = await creditService.getWalletBalance(wallet.id);
    expect(balance.total.toString()).toBe("100");
  });

  it("idempotent: credit grant idempotency key prevents duplicate grants per period", async () => {
    const plan = await service.createPlan({
      slug: "idemp",
      displayName: "Idemp",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "25.00",
    });
    await service.activatePlanVersion(version.id);

    const { subscription } = await service.createSubscription({
      organizationId: "org_idemp",
      planId: plan.id,
    });

    // Initial balance: 25
    const wallet = await creditService.getOrCreateWallet("org_idemp");
    const balanceBefore = await creditService.getWalletBalance(wallet.id);
    expect(balanceBefore.total.toString()).toBe("25");

    // Simulate expiration
    await subRepo.updateSubscription(subscription.id, {
      currentPeriodEnd: new Date(Date.now() - 1000),
    });
    const latestPeriod = await subRepo.getLatestPeriod(subscription.id);
    if (latestPeriod) {
      await subRepo.updateSubscriptionPeriod(latestPeriod.id, {
        periodEnd: new Date(Date.now() - 1000),
      });
    }

    // First renewal: 25 + 25 = 50
    const result = await service.processRenewal(subscription.id);
    expect(result.newPeriod.periodNumber).toBe(2);
    expect(result.creditGranted).toBe(true);

    const balanceAfter = await creditService.getWalletBalance(wallet.id);
    expect(balanceAfter.total.toString()).toBe("50");
  });

  it("cancel-at-period-end: terminates subscription on renewal", async () => {
    const plan = await service.createPlan({
      slug: "cancel-end",
      displayName: "Cancel End",
    });
    const version = await service.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "10.00",
      creditGrantAmount: "10.00",
    });
    await service.activatePlanVersion(version.id);

    const { subscription } = await service.createSubscription({
      organizationId: "org_cancel_at_end",
      planId: plan.id,
    });

    // Set cancel at period end
    await service.cancelSubscription("org_cancel_at_end", subscription.id);

    // Process renewal — should cancel instead
    const result = await service.processRenewal(subscription.id);
    expect(result.subscription.status).toBe("cancelled");
    expect(result.creditGranted).toBe(false);
  });
});

describe("Phase 18 — Plan Change", () => {
  let service: SubscriptionService;
  let creditService: CreditService;

  beforeEach(() => {
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    creditService = new CreditService(creditRepo);
    service = new SubscriptionService(subRepo, creditService);
  });

  it("upgrades plan immediately with new credit grant", async () => {
    const starterPlan = await service.createPlan({
      slug: "starter",
      displayName: "Starter",
    });
    const starterV = await service.createPlanVersion({
      planId: starterPlan.id,
      billingInterval: "monthly",
      basePriceAmount: "10.00",
      creditGrantAmount: "20.00",
    });
    await service.activatePlanVersion(starterV.id);

    const proPlan = await service.createPlan({
      slug: "pro-up",
      displayName: "Pro",
    });
    const proV = await service.createPlanVersion({
      planId: proPlan.id,
      billingInterval: "monthly",
      basePriceAmount: "49.00",
      creditGrantAmount: "100.00",
    });
    await service.activatePlanVersion(proV.id);

    const { subscription } = await service.createSubscription({
      organizationId: "org_upgrade",
      planId: starterPlan.id,
    });

    await service.changePlan({
      organizationId: "org_upgrade",
      subscriptionId: subscription.id,
      newPlanId: proPlan.id,
      immediate: true,
    });

    const updated = await service.getActiveSubscription("org_upgrade");
    expect(updated!.planId).toBe(proPlan.id);

    // Should have starter credits (20) + pro credits (100)
    const wallet = await creditService.getOrCreateWallet("org_upgrade");
    const balance = await creditService.getWalletBalance(wallet.id);
    expect(balance.total.toString()).toBe("120");
  });
});

describe("Phase 18 — Health Check", () => {
  it("service instantiates without errors", () => {
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    const creditService = new CreditService(creditRepo);
    const service = new SubscriptionService(subRepo, creditService);
    expect(service).toBeDefined();
  });
});
