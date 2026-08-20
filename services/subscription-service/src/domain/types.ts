export type {
  Plan,
  PlanVersion,
  PlanVersionStatus,
  EntitlementDefinition,
  ModelAccessRule,
  PlanLimit,
  OrganizationSubscription,
  SubscriptionStatus,
  SubscriptionPeriod,
  SubscriptionPeriodStatus,
  EntitlementOverride,
  FundingMode,
  BillingInterval,
} from "@growx/subscriptions";

/**
 * Repository interface for subscription persistence.
 * All tenant-scoped methods require organizationId.
 */
export interface ISubscriptionRepository {
  // ─── Plan CRUD ───────────────────────────────────────────────
  savePlan(plan: import("@growx/subscriptions").Plan): Promise<void>;
  getPlanById(id: string): Promise<import("@growx/subscriptions").Plan | undefined>;
  getPlanBySlug(slug: string): Promise<import("@growx/subscriptions").Plan | undefined>;
  listPlans(filter?: { status?: string; isPublic?: boolean }): Promise<import("@growx/subscriptions").Plan[]>;
  updatePlan(id: string, updates: Partial<import("@growx/subscriptions").Plan>): Promise<void>;

  // ─── Plan Version CRUD ───────────────────────────────────────
  savePlanVersion(version: import("@growx/subscriptions").PlanVersion): Promise<void>;
  getPlanVersionById(id: string): Promise<import("@growx/subscriptions").PlanVersion | undefined>;
  getPlanVersion(planId: string, version: number): Promise<import("@growx/subscriptions").PlanVersion | undefined>;
  getActivePlanVersion(planId: string): Promise<import("@growx/subscriptions").PlanVersion | undefined>;
  listPlanVersions(planId: string): Promise<import("@growx/subscriptions").PlanVersion[]>;
  updatePlanVersion(id: string, updates: Partial<import("@growx/subscriptions").PlanVersion>): Promise<void>;

  // ─── Subscription CRUD ───────────────────────────────────────
  saveSubscription(sub: import("@growx/subscriptions").OrganizationSubscription): Promise<void>;
  getSubscriptionById(id: string): Promise<import("@growx/subscriptions").OrganizationSubscription | undefined>;
  getActiveSubscription(organizationId: string): Promise<import("@growx/subscriptions").OrganizationSubscription | undefined>;
  updateSubscription(id: string, updates: Partial<import("@growx/subscriptions").OrganizationSubscription>): Promise<void>;
  listSubscriptionsDueForRenewal(before: Date, limit: number): Promise<import("@growx/subscriptions").OrganizationSubscription[]>;

  // ─── Subscription Periods ────────────────────────────────────
  saveSubscriptionPeriod(period: import("@growx/subscriptions").SubscriptionPeriod): Promise<void>;
  getSubscriptionPeriod(subscriptionId: string, periodNumber: number): Promise<import("@growx/subscriptions").SubscriptionPeriod | undefined>;
  getLatestPeriod(subscriptionId: string): Promise<import("@growx/subscriptions").SubscriptionPeriod | undefined>;
  updateSubscriptionPeriod(id: string, updates: Partial<import("@growx/subscriptions").SubscriptionPeriod>): Promise<void>;

  // ─── Entitlement Overrides ───────────────────────────────────
  saveEntitlementOverride(override: import("@growx/subscriptions").EntitlementOverride): Promise<void>;
  getEntitlementOverrides(organizationId: string): Promise<import("@growx/subscriptions").EntitlementOverride[]>;
  deleteEntitlementOverride(organizationId: string, key: string): Promise<void>;

  // ─── Transaction ─────────────────────────────────────────────
  withTransaction<T>(fn: (tx: ISubscriptionRepository) => Promise<T>): Promise<T>;
}

/** Parameters for creating a new subscription */
export interface CreateSubscriptionParams {
  organizationId: string;
  planId: string;
  planVersionId?: string; // If omitted, uses active version
  fundingMode?: import("@growx/subscriptions").FundingMode;
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

/** Parameters for changing a subscription's plan */
export interface ChangePlanParams {
  organizationId: string;
  subscriptionId: string;
  newPlanId: string;
  newPlanVersionId?: string;
  immediate?: boolean; // If true, changes now. If false, changes at period end.
}
