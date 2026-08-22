import { Decimal } from "@growx/money";
import { createPublicId } from "@growx/ids";
import {
  resolveEntitlements,
  validateTransition,
  calculateInitialPeriod,
  calculateNextPeriod,
  DENY_ALL_ENTITLEMENTS,
} from "@growx/subscriptions";
import type {
  Plan,
  PlanVersion,
  PlanVersionStatus,
  OrganizationSubscription,
  SubscriptionPeriod,
  EntitlementOverride,
  ResolvedEntitlements,
  FundingMode,
  BillingInterval,
  EntitlementDefinition,
  ModelAccessRule,
  PlanLimit,
  SubscriptionStatus,
} from "@growx/subscriptions";
import type {
  ISubscriptionRepository,
  CreateSubscriptionParams,
  ChangePlanParams,
} from "../domain/types.js";
import type { CreditService } from "@growx/credit-service";

export class SubscriptionService {
  constructor(
    private readonly repository: ISubscriptionRepository,
    private readonly creditService: CreditService,
    private readonly idGenerator: (prefix: string) => string = (p) =>
      createPublicId(p as any) ||
      `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ) {}

  // ─── Plan CRUD ───────────────────────────────────────────────

  async createPlan(params: {
    slug: string;
    displayName: string;
    description?: string;
    isPublic?: boolean;
    sortOrder?: number;
  }): Promise<Plan> {
    const existing = await this.repository.getPlanBySlug(params.slug);
    if (existing)
      throw new Error(`Plan with slug '${params.slug}' already exists`);

    const now = new Date();
    const plan: Plan = {
      id: this.idGenerator("plan"),
      slug: params.slug,
      displayName: params.displayName,
      description: params.description,
      isPublic: params.isPublic ?? true,
      sortOrder: params.sortOrder ?? 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.savePlan(plan);
    return plan;
  }

  async createPlanVersion(params: {
    planId: string;
    billingInterval: BillingInterval;
    basePriceAmount: Decimal | string;
    currency?: string;
    creditGrantAmount: Decimal | string;
    entitlements?: EntitlementDefinition[];
    modelAccessRules?: ModelAccessRule[];
    limits?: PlanLimit[];
    featureFlags?: string[];
    commercialTerms?: Record<string, unknown>;
  }): Promise<PlanVersion> {
    const plan = await this.repository.getPlanById(params.planId);
    if (!plan) throw new Error(`Plan ${params.planId} not found`);

    // Determine next version number
    const versions = await this.repository.listPlanVersions(params.planId);
    const nextVersion =
      versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;

    const now = new Date();
    const planVersion: PlanVersion = {
      id: this.idGenerator("pv"),
      planId: params.planId,
      version: nextVersion,
      status: "draft",
      displayName: `${plan.displayName} v${nextVersion}`,
      billingInterval: params.billingInterval,
      basePriceAmount: Decimal.from(params.basePriceAmount),
      currency: params.currency ?? "USD",
      creditGrantAmount: Decimal.from(params.creditGrantAmount),
      entitlements: params.entitlements ?? [],
      modelAccessRules: params.modelAccessRules ?? [],
      limits: params.limits ?? [],
      featureFlags: params.featureFlags ?? [],
      commercialTerms: params.commercialTerms ?? {},
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.savePlanVersion(planVersion);
    return planVersion;
  }

  async activatePlanVersion(planVersionId: string): Promise<PlanVersion> {
    const version = await this.repository.getPlanVersionById(planVersionId);
    if (!version) throw new Error(`PlanVersion ${planVersionId} not found`);
    if (version.status !== "draft") {
      throw new Error(
        `Cannot activate plan version in '${version.status}' status; must be 'draft'`,
      );
    }

    // Archive any currently active version for this plan
    const currentActive = await this.repository.getActivePlanVersion(
      version.planId,
    );
    if (currentActive) {
      await this.repository.updatePlanVersion(currentActive.id, {
        status: "archived" as PlanVersionStatus,
      });
    }

    const now = new Date();
    await this.repository.updatePlanVersion(planVersionId, {
      status: "active" as PlanVersionStatus,
      effectiveFrom: now,
    });

    return (await this.repository.getPlanVersionById(planVersionId))!;
  }

  async archivePlanVersion(planVersionId: string): Promise<void> {
    const version = await this.repository.getPlanVersionById(planVersionId);
    if (!version) throw new Error(`PlanVersion ${planVersionId} not found`);
    await this.repository.updatePlanVersion(planVersionId, {
      status: "archived" as PlanVersionStatus,
    });
  }

  async listPlans(filter?: {
    status?: string;
    isPublic?: boolean;
  }): Promise<Plan[]> {
    return this.repository.listPlans(filter);
  }

  async getPlanVersion(
    planId: string,
    version: number,
  ): Promise<PlanVersion | undefined> {
    return this.repository.getPlanVersion(planId, version);
  }

  // ─── Subscription Lifecycle ──────────────────────────────────

  async createSubscription(params: CreateSubscriptionParams): Promise<{
    subscription: OrganizationSubscription;
    period: SubscriptionPeriod;
  }> {
    // Check for existing active subscription
    const existing = await this.repository.getActiveSubscription(
      params.organizationId,
    );
    if (existing) {
      throw new Error(
        `Organization ${params.organizationId} already has an active subscription (${existing.id})`,
      );
    }

    const plan = await this.repository.getPlanById(params.planId);
    if (!plan) throw new Error(`Plan ${params.planId} not found`);

    // Resolve plan version
    let planVersion: PlanVersion | undefined;
    if (params.planVersionId) {
      planVersion = await this.repository.getPlanVersionById(
        params.planVersionId,
      );
    } else {
      planVersion = await this.repository.getActivePlanVersion(params.planId);
    }
    if (!planVersion)
      throw new Error(`No active plan version found for plan ${params.planId}`);
    if (planVersion.status !== "active")
      throw new Error(`Plan version ${planVersion.id} is not active`);

    const now = new Date();
    const isTrialing = (params.trialDays ?? 0) > 0;
    const status: SubscriptionStatus = isTrialing ? "trialing" : "active";

    // Calculate initial period
    const { periodStart, periodEnd, periodNumber } = calculateInitialPeriod(
      now,
      planVersion.billingInterval,
    );

    const trialEnd = isTrialing
      ? new Date(now.getTime() + params.trialDays! * 86400000)
      : undefined;

    const subscription: OrganizationSubscription = {
      id: this.idGenerator("sub"),
      organizationId: params.organizationId,
      planId: params.planId,
      planVersionId: planVersion.id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      trialEnd,
      fundingMode: params.fundingMode ?? "manual",
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const period: SubscriptionPeriod = {
      id: this.idGenerator("sp"),
      subscriptionId: subscription.id,
      periodNumber,
      periodStart,
      periodEnd,
      status: "active",
      createdAt: now,
    };

    await this.repository.withTransaction(async (tx) => {
      await tx.saveSubscription(subscription);
      await tx.saveSubscriptionPeriod(period);
    });

    // Grant initial credits (unless trialing with no initial grant)
    if (!isTrialing && planVersion.creditGrantAmount.gt(Decimal.ZERO)) {
      const idempotencyKey = `sub_${subscription.id}_period_${periodNumber}`;
      const grantResult = await this.creditService.grantCredits({
        organizationId: params.organizationId,
        amount: planVersion.creditGrantAmount,
        lotType: "subscription",
        sourceType: "subscription_renewal",
        sourceId: subscription.id,
        idempotencyKey,
        expiresAt: periodEnd,
      });

      await this.repository.updateSubscriptionPeriod(period.id, {
        creditGrantId: grantResult.lot.id,
      });
    }

    return { subscription, period };
  }

  async cancelSubscription(
    organizationId: string,
    subscriptionId: string,
    opts?: { immediate?: boolean },
  ): Promise<OrganizationSubscription> {
    const sub = await this.repository.getSubscriptionById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    if (sub.organizationId !== organizationId)
      throw new Error("Subscription does not belong to this organization");

    const transition = validateTransition(sub.status, "cancelled");
    if (!transition.valid) throw new Error(transition.reason);

    const now = new Date();
    if (opts?.immediate) {
      await this.repository.updateSubscription(subscriptionId, {
        status: "cancelled",
        cancelledAt: now,
        cancelAtPeriodEnd: false,
      });
    } else {
      await this.repository.updateSubscription(subscriptionId, {
        cancelAtPeriodEnd: true,
        cancelledAt: now,
      });
    }

    return (await this.repository.getSubscriptionById(subscriptionId))!;
  }

  async pauseSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<OrganizationSubscription> {
    const sub = await this.repository.getSubscriptionById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    if (sub.organizationId !== organizationId)
      throw new Error("Subscription does not belong to this organization");

    const transition = validateTransition(sub.status, "paused");
    if (!transition.valid) throw new Error(transition.reason);

    await this.repository.updateSubscription(subscriptionId, {
      status: "paused",
      pausedAt: new Date(),
    });

    return (await this.repository.getSubscriptionById(subscriptionId))!;
  }

  async resumeSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<OrganizationSubscription> {
    const sub = await this.repository.getSubscriptionById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    if (sub.organizationId !== organizationId)
      throw new Error("Subscription does not belong to this organization");

    const transition = validateTransition(sub.status, "active");
    if (!transition.valid) throw new Error(transition.reason);

    await this.repository.updateSubscription(subscriptionId, {
      status: "active",
      resumedAt: new Date(),
      pausedAt: undefined,
    });

    return (await this.repository.getSubscriptionById(subscriptionId))!;
  }

  async changePlan(
    params: ChangePlanParams,
  ): Promise<OrganizationSubscription> {
    const sub = await this.repository.getSubscriptionById(
      params.subscriptionId,
    );
    if (!sub)
      throw new Error(`Subscription ${params.subscriptionId} not found`);
    if (sub.organizationId !== params.organizationId)
      throw new Error("Subscription does not belong to this organization");
    if (sub.status !== "active" && sub.status !== "trialing") {
      throw new Error(
        `Cannot change plan while subscription is in '${sub.status}' state`,
      );
    }

    const newPlan = await this.repository.getPlanById(params.newPlanId);
    if (!newPlan) throw new Error(`Plan ${params.newPlanId} not found`);

    let newVersion: PlanVersion | undefined;
    if (params.newPlanVersionId) {
      newVersion = await this.repository.getPlanVersionById(
        params.newPlanVersionId,
      );
    } else {
      newVersion = await this.repository.getActivePlanVersion(params.newPlanId);
    }
    if (!newVersion || newVersion.status !== "active") {
      throw new Error(`No active version found for plan ${params.newPlanId}`);
    }

    const now = new Date();
    if (params.immediate) {
      // Immediate plan change: new period starts now
      const { periodStart, periodEnd, periodNumber } = calculateInitialPeriod(
        now,
        newVersion.billingInterval,
      );

      await this.repository.updateSubscription(params.subscriptionId, {
        planId: params.newPlanId,
        planVersionId: newVersion.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      const period: SubscriptionPeriod = {
        id: this.idGenerator("sp"),
        subscriptionId: params.subscriptionId,
        periodNumber,
        periodStart,
        periodEnd,
        status: "active",
        createdAt: now,
      };
      await this.repository.saveSubscriptionPeriod(period);

      // Grant credits for new plan
      if (newVersion.creditGrantAmount.gt(Decimal.ZERO)) {
        const idempotencyKey = `sub_${params.subscriptionId}_change_${now.getTime()}`;
        await this.creditService.grantCredits({
          organizationId: params.organizationId,
          amount: newVersion.creditGrantAmount,
          lotType: "subscription",
          sourceType: "plan_change",
          sourceId: params.subscriptionId,
          idempotencyKey,
          expiresAt: periodEnd,
        });
      }
    } else {
      // Deferred: plan changes at next period renewal
      await this.repository.updateSubscription(params.subscriptionId, {
        metadata: {
          ...sub.metadata,
          pendingPlanChange: {
            newPlanId: params.newPlanId,
            newPlanVersionId: newVersion.id,
            scheduledAt: now.toISOString(),
          },
        },
      });
    }

    return (await this.repository.getSubscriptionById(params.subscriptionId))!;
  }

  // ─── Entitlement Resolution ──────────────────────────────────

  async resolveEntitlements(
    organizationId: string,
  ): Promise<ResolvedEntitlements> {
    try {
      const sub = await this.repository.getActiveSubscription(organizationId);
      if (!sub) return DENY_ALL_ENTITLEMENTS;

      const planVersion = await this.repository.getPlanVersionById(
        sub.planVersionId,
      );
      if (!planVersion) return DENY_ALL_ENTITLEMENTS;

      const overrides =
        await this.repository.getEntitlementOverrides(organizationId);

      return resolveEntitlements(planVersion, overrides);
    } catch {
      // Fail closed
      return DENY_ALL_ENTITLEMENTS;
    }
  }

  // ─── Renewal ─────────────────────────────────────────────────

  async processRenewal(subscriptionId: string): Promise<{
    subscription: OrganizationSubscription;
    newPeriod: SubscriptionPeriod;
    creditGranted: boolean;
  }> {
    const sub = await this.repository.getSubscriptionById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    // Handle cancel-at-period-end
    if (sub.cancelAtPeriodEnd) {
      await this.repository.updateSubscription(subscriptionId, {
        status: "cancelled",
        cancelledAt: new Date(),
      });
      return {
        subscription:
          (await this.repository.getSubscriptionById(subscriptionId))!,
        newPeriod: null as any,
        creditGranted: false,
      };
    }

    if (sub.status !== "active" && sub.status !== "trialing") {
      throw new Error(`Cannot renew subscription in '${sub.status}' state`);
    }

    const planVersion = await this.repository.getPlanVersionById(
      sub.planVersionId,
    );
    if (!planVersion)
      throw new Error(`PlanVersion ${sub.planVersionId} not found`);

    // Check for pending plan change
    const pendingChange = (sub.metadata as any)?.pendingPlanChange;
    let effectiveVersion = planVersion;
    if (pendingChange) {
      const newVersion = await this.repository.getPlanVersionById(
        pendingChange.newPlanVersionId,
      );
      if (newVersion && newVersion.status === "active") {
        effectiveVersion = newVersion;
        await this.repository.updateSubscription(subscriptionId, {
          planId: pendingChange.newPlanId,
          planVersionId: newVersion.id,
          metadata: { ...sub.metadata, pendingPlanChange: undefined },
        });
      }
    }

    // Calculate next period
    const latestPeriod = await this.repository.getLatestPeriod(subscriptionId);
    const anchorDate = sub.createdAt;
    const { periodStart, periodEnd, periodNumber } = calculateNextPeriod(
      latestPeriod ?? {
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        periodNumber: 0,
      },
      effectiveVersion.billingInterval,
      anchorDate,
    );

    // Idempotency check: if period already exists, return it
    const existingPeriod = await this.repository.getSubscriptionPeriod(
      subscriptionId,
      periodNumber,
    );
    if (existingPeriod) {
      return {
        subscription: sub,
        newPeriod: existingPeriod,
        creditGranted: !!existingPeriod.creditGrantId,
      };
    }

    // Mark old period as renewed
    if (latestPeriod) {
      await this.repository.updateSubscriptionPeriod(latestPeriod.id, {
        status: "renewed",
      });
    }

    // Handle trial-to-active transition
    let newStatus = sub.status;
    if (sub.status === "trialing") {
      newStatus = "active";
    }

    const now = new Date();
    const newPeriod: SubscriptionPeriod = {
      id: this.idGenerator("sp"),
      subscriptionId,
      periodNumber,
      periodStart,
      periodEnd,
      status: "active",
      createdAt: now,
    };

    await this.repository.withTransaction(async (tx) => {
      await tx.saveSubscriptionPeriod(newPeriod);
      await tx.updateSubscription(subscriptionId, {
        status: newStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
    });

    // Grant credits
    let creditGranted = false;
    if (effectiveVersion.creditGrantAmount.gt(Decimal.ZERO)) {
      const idempotencyKey = `sub_${subscriptionId}_period_${periodNumber}`;
      const grantResult = await this.creditService.grantCredits({
        organizationId: sub.organizationId,
        amount: effectiveVersion.creditGrantAmount,
        lotType: "subscription",
        sourceType: "subscription_renewal",
        sourceId: subscriptionId,
        idempotencyKey,
        expiresAt: periodEnd,
      });

      await this.repository.updateSubscriptionPeriod(newPeriod.id, {
        creditGrantId: grantResult.lot.id,
      });
      creditGranted = true;
    }

    return {
      subscription:
        (await this.repository.getSubscriptionById(subscriptionId))!,
      newPeriod: (await this.repository.getSubscriptionPeriod(
        subscriptionId,
        periodNumber,
      ))!,
      creditGranted,
    };
  }

  // ─── Entitlement Overrides ───────────────────────────────────

  async setEntitlementOverride(params: {
    organizationId: string;
    key: string;
    type: EntitlementDefinition["type"];
    value: string;
    reason: string;
    createdBy: string;
    expiresAt?: Date;
  }): Promise<EntitlementOverride> {
    const now = new Date();
    const override: EntitlementOverride = {
      id: this.idGenerator("eo"),
      organizationId: params.organizationId,
      key: params.key,
      type: params.type,
      value: params.value,
      reason: params.reason,
      expiresAt: params.expiresAt,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveEntitlementOverride(override);
    return override;
  }

  async removeEntitlementOverride(
    organizationId: string,
    key: string,
  ): Promise<void> {
    await this.repository.deleteEntitlementOverride(organizationId, key);
  }

  // ─── Queries ─────────────────────────────────────────────────

  async getActiveSubscription(
    organizationId: string,
  ): Promise<OrganizationSubscription | undefined> {
    return this.repository.getActiveSubscription(organizationId);
  }

  async getSubscriptionsDueForRenewal(
    limit: number = 100,
  ): Promise<OrganizationSubscription[]> {
    return this.repository.listSubscriptionsDueForRenewal(new Date(), limit);
  }
}
