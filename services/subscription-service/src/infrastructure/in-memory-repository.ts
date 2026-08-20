import type {
  Plan,
  PlanVersion,
  OrganizationSubscription,
  SubscriptionPeriod,
  EntitlementOverride,
} from "@growx/subscriptions";
import type { ISubscriptionRepository } from "../domain/types.js";

/**
 * In-memory implementation of ISubscriptionRepository for tests.
 */
export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  readonly plans = new Map<string, Plan>();
  readonly planVersions = new Map<string, PlanVersion>();
  readonly subscriptions = new Map<string, OrganizationSubscription>();
  readonly periods = new Map<string, SubscriptionPeriod>();
  readonly overrides = new Map<string, EntitlementOverride>();

  // ─── Plan CRUD ───────────────────────────────────────────────

  async savePlan(plan: Plan): Promise<void> {
    this.plans.set(plan.id, { ...plan });
  }

  async getPlanById(id: string): Promise<Plan | undefined> {
    const p = this.plans.get(id);
    return p ? { ...p } : undefined;
  }

  async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    for (const p of this.plans.values()) {
      if (p.slug === slug) return { ...p };
    }
    return undefined;
  }

  async listPlans(filter?: { status?: string; isPublic?: boolean }): Promise<Plan[]> {
    let result = Array.from(this.plans.values());
    if (filter?.status) result = result.filter((p) => p.status === filter.status);
    if (filter?.isPublic !== undefined) result = result.filter((p) => p.isPublic === filter.isPublic);
    return result.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({ ...p }));
  }

  async updatePlan(id: string, updates: Partial<Plan>): Promise<void> {
    const existing = this.plans.get(id);
    if (!existing) throw new Error(`Plan ${id} not found`);
    this.plans.set(id, { ...existing, ...updates, updatedAt: new Date() });
  }

  // ─── Plan Version CRUD ───────────────────────────────────────

  async savePlanVersion(version: PlanVersion): Promise<void> {
    this.planVersions.set(version.id, { ...version });
  }

  async getPlanVersionById(id: string): Promise<PlanVersion | undefined> {
    const v = this.planVersions.get(id);
    return v ? { ...v } : undefined;
  }

  async getPlanVersion(planId: string, version: number): Promise<PlanVersion | undefined> {
    for (const v of this.planVersions.values()) {
      if (v.planId === planId && v.version === version) return { ...v };
    }
    return undefined;
  }

  async getActivePlanVersion(planId: string): Promise<PlanVersion | undefined> {
    for (const v of this.planVersions.values()) {
      if (v.planId === planId && v.status === "active") return { ...v };
    }
    return undefined;
  }

  async listPlanVersions(planId: string): Promise<PlanVersion[]> {
    return Array.from(this.planVersions.values())
      .filter((v) => v.planId === planId)
      .sort((a, b) => a.version - b.version)
      .map((v) => ({ ...v }));
  }

  async updatePlanVersion(id: string, updates: Partial<PlanVersion>): Promise<void> {
    const existing = this.planVersions.get(id);
    if (!existing) throw new Error(`PlanVersion ${id} not found`);
    this.planVersions.set(id, { ...existing, ...updates, updatedAt: new Date() });
  }

  // ─── Subscription CRUD ───────────────────────────────────────

  async saveSubscription(sub: OrganizationSubscription): Promise<void> {
    this.subscriptions.set(sub.id, { ...sub });
  }

  async getSubscriptionById(id: string): Promise<OrganizationSubscription | undefined> {
    const s = this.subscriptions.get(id);
    return s ? { ...s } : undefined;
  }

  async getActiveSubscription(organizationId: string): Promise<OrganizationSubscription | undefined> {
    for (const s of this.subscriptions.values()) {
      if (s.organizationId === organizationId && (s.status === "active" || s.status === "trialing")) {
        return { ...s };
      }
    }
    return undefined;
  }

  async updateSubscription(id: string, updates: Partial<OrganizationSubscription>): Promise<void> {
    const existing = this.subscriptions.get(id);
    if (!existing) throw new Error(`Subscription ${id} not found`);
    this.subscriptions.set(id, { ...existing, ...updates, updatedAt: new Date() });
  }

  async listSubscriptionsDueForRenewal(before: Date, limit: number): Promise<OrganizationSubscription[]> {
    return Array.from(this.subscriptions.values())
      .filter((s) => (s.status === "active" || s.status === "trialing") && s.currentPeriodEnd <= before)
      .sort((a, b) => a.currentPeriodEnd.getTime() - b.currentPeriodEnd.getTime())
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  // ─── Subscription Periods ────────────────────────────────────

  async saveSubscriptionPeriod(period: SubscriptionPeriod): Promise<void> {
    this.periods.set(period.id, { ...period });
  }

  async getSubscriptionPeriod(subscriptionId: string, periodNumber: number): Promise<SubscriptionPeriod | undefined> {
    for (const p of this.periods.values()) {
      if (p.subscriptionId === subscriptionId && p.periodNumber === periodNumber) return { ...p };
    }
    return undefined;
  }

  async getLatestPeriod(subscriptionId: string): Promise<SubscriptionPeriod | undefined> {
    let latest: SubscriptionPeriod | undefined;
    for (const p of this.periods.values()) {
      if (p.subscriptionId === subscriptionId) {
        if (!latest || p.periodNumber > latest.periodNumber) latest = p;
      }
    }
    return latest ? { ...latest } : undefined;
  }

  async updateSubscriptionPeriod(id: string, updates: Partial<SubscriptionPeriod>): Promise<void> {
    const existing = this.periods.get(id);
    if (!existing) throw new Error(`SubscriptionPeriod ${id} not found`);
    this.periods.set(id, { ...existing, ...updates });
  }

  // ─── Entitlement Overrides ───────────────────────────────────

  async saveEntitlementOverride(override: EntitlementOverride): Promise<void> {
    this.overrides.set(`${override.organizationId}:${override.key}`, { ...override });
  }

  async getEntitlementOverrides(organizationId: string): Promise<EntitlementOverride[]> {
    return Array.from(this.overrides.values())
      .filter((o) => o.organizationId === organizationId)
      .map((o) => ({ ...o }));
  }

  async deleteEntitlementOverride(organizationId: string, key: string): Promise<void> {
    this.overrides.delete(`${organizationId}:${key}`);
  }

  // ─── Transaction ─────────────────────────────────────────────

  async withTransaction<T>(fn: (tx: ISubscriptionRepository) => Promise<T>): Promise<T> {
    // In-memory: just run the function with same instance
    return fn(this);
  }
}
