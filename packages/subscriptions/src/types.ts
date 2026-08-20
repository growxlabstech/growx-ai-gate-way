import { Decimal } from "@growx/money";

// ─── Plan Types ──────────────────────────────────────────────

export type PlanStatus = "active" | "archived" | "hidden";

export interface Plan {
  id: string;
  slug: string;
  displayName: string;
  description?: string | undefined;
  isPublic: boolean;
  sortOrder: number;
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PlanVersionStatus = "draft" | "active" | "archived" | "grandfathered";
export type BillingInterval = "monthly" | "annual" | "custom";

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  status: PlanVersionStatus;
  displayName: string;
  description?: string | undefined;
  billingInterval: BillingInterval;
  basePriceAmount: Decimal;
  currency: string;
  creditGrantAmount: Decimal;
  entitlements: EntitlementDefinition[];
  modelAccessRules: ModelAccessRule[];
  limits: PlanLimit[];
  featureFlags: string[];
  commercialTerms: Record<string, unknown>;
  effectiveFrom?: Date | undefined;
  effectiveUntil?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Entitlement Types ───────────────────────────────────────

export type EntitlementValueType = "boolean" | "integer" | "decimal" | "string" | "set";

export interface EntitlementDefinition {
  key: string;
  type: EntitlementValueType;
  value: string; // Serialized: "true", "10", "3.50", "premium", "gpt-4o,claude-3.5"
  description?: string | undefined;
}

export interface ModelAccessRule {
  pattern: string; // Glob: "openai/*", "anthropic/claude-3.5-*"
  effect: "allow" | "deny";
  maxTokensPerRequest?: number | undefined;
  rateLimitOverride?: Record<string, unknown> | undefined;
}

export interface PlanLimit {
  key: string; // e.g. "requests_per_minute", "max_api_keys", "max_workspaces"
  value: number;
  window?: "minute" | "hour" | "day" | "month" | undefined;
}

// ─── Subscription Types ──────────────────────────────────────

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired";

export type FundingMode =
  | "manual"
  | "free"
  | "external_payment_future"
  | "enterprise_contract";

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  planVersionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | undefined;
  pausedAt?: Date | undefined;
  resumedAt?: Date | undefined;
  trialEnd?: Date | undefined;
  fundingMode: FundingMode;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionPeriodStatus = "pending" | "active" | "renewed" | "expired";

export interface SubscriptionPeriod {
  id: string;
  subscriptionId: string;
  periodNumber: number;
  periodStart: Date;
  periodEnd: Date;
  creditGrantId?: string | undefined;
  status: SubscriptionPeriodStatus;
  createdAt: Date;
}

// ─── Entitlement Override ────────────────────────────────────

export interface EntitlementOverride {
  id: string;
  organizationId: string;
  key: string;
  type: EntitlementValueType;
  value: string;
  reason: string;
  expiresAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Resolved Entitlements ───────────────────────────────────

/**
 * The merged result of a plan's entitlements + organization overrides.
 * Provides typed accessors for each entitlement value type.
 */
export class ResolvedEntitlements {
  constructor(
    private readonly entries: ReadonlyMap<string, EntitlementDefinition>,
    private readonly modelRules: readonly ModelAccessRule[],
    private readonly planLimits: readonly PlanLimit[],
    private readonly features: ReadonlySet<string>,
    public readonly planVersionId: string,
    public readonly planId: string,
  ) {}

  /** Returns true if entitlement key exists and is a boolean "true". */
  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const entry = this.entries.get(key);
    if (!entry || entry.type !== "boolean") return defaultValue;
    return entry.value === "true";
  }

  /** Returns the integer value for a key, or default if missing. */
  getInteger(key: string, defaultValue: number = 0): number {
    const entry = this.entries.get(key);
    if (!entry || entry.type !== "integer") return defaultValue;
    const parsed = parseInt(entry.value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  /** Returns the decimal value for a key. */
  getDecimal(key: string, defaultValue: Decimal = Decimal.ZERO): Decimal {
    const entry = this.entries.get(key);
    if (!entry || entry.type !== "decimal") return defaultValue;
    try {
      return Decimal.from(entry.value);
    } catch {
      return defaultValue;
    }
  }

  /** Returns the string value for a key. */
  getString(key: string, defaultValue: string = ""): string {
    const entry = this.entries.get(key);
    if (!entry || entry.type !== "string") return defaultValue;
    return entry.value;
  }

  /** Returns the set value for a key (comma-separated in storage). */
  getSet(key: string): ReadonlySet<string> {
    const entry = this.entries.get(key);
    if (!entry || entry.type !== "set") return new Set();
    return new Set(entry.value.split(",").map((s) => s.trim()).filter(Boolean));
  }

  /** Check whether a specific model is allowed by this plan's model access rules. */
  checkModelAccess(canonicalModelId: string): { allowed: boolean; reason?: string } {
    if (this.modelRules.length === 0) {
      // No rules = all models allowed
      return { allowed: true };
    }

    let explicitlyAllowed = false;
    let hasDenyRules = false;
    let hasAllowRules = false;

    for (const rule of this.modelRules) {
      const matches = globMatch(rule.pattern, canonicalModelId);
      if (!matches) continue;

      if (rule.effect === "deny") {
        hasDenyRules = true;
        // Deny overrides allow (per AGENTS.md: deny rules override allows)
        return {
          allowed: false,
          reason: `Model ${canonicalModelId} denied by plan rule: ${rule.pattern}`,
        };
      }

      if (rule.effect === "allow") {
        hasAllowRules = true;
        explicitlyAllowed = true;
      }
    }

    // If there are allow rules but none matched, deny
    if (hasAllowRules && !explicitlyAllowed) {
      return {
        allowed: false,
        reason: `Model ${canonicalModelId} not included in plan's allowed models`,
      };
    }

    return { allowed: true };
  }

  /** Get a specific plan limit. */
  getLimit(key: string): PlanLimit | undefined {
    return this.planLimits.find((l) => l.key === key);
  }

  /** Check if a feature flag is enabled. */
  hasFeature(flag: string): boolean {
    return this.features.has(flag);
  }

  /** Get all entitlement keys. */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Check if an entitlement key exists. */
  has(key: string): boolean {
    return this.entries.has(key);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Simple glob matching supporting '*' wildcard.
 * "openai/*" matches "openai/gpt-4o-mini"
 * "anthropic/claude-3.5-*" matches "anthropic/claude-3.5-sonnet"
 */
export function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr).test(value);
}

// ─── Empty / Deny-All Entitlements ───────────────────────────

/** Returns a deny-all ResolvedEntitlements — used when resolution fails (fail-closed). */
export const DENY_ALL_ENTITLEMENTS = new ResolvedEntitlements(
  new Map(),
  [{ pattern: "*", effect: "deny" as const }],
  [],
  new Set(),
  "none",
  "none",
);
