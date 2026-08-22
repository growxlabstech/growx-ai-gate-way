import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  validateTransition,
  isTerminalState,
  getValidTransitions,
  resolveEntitlements,
  ResolvedEntitlements,
  DENY_ALL_ENTITLEMENTS,
  globMatch,
  calculateInitialPeriod,
  calculateNextPeriod,
  isPeriodExpired,
  isWithinPeriod,
} from "./index.js";
import type { PlanVersion, EntitlementOverride } from "./index.js";

// ─── Helpers ─────────────────────────────────────────────────

function makePlanVersion(overrides: Partial<PlanVersion> = {}): PlanVersion {
  const now = new Date();
  return {
    id: "pv_test_1",
    planId: "plan_test_1",
    version: 1,
    status: "active",
    displayName: "Pro Plan v1",
    billingInterval: "monthly",
    basePriceAmount: new Decimal("29.00"),
    currency: "USD",
    creditGrantAmount: new Decimal("50.00"),
    entitlements: [
      { key: "max_workspaces", type: "integer", value: "10" },
      { key: "streaming_enabled", type: "boolean", value: "true" },
      { key: "max_spend_per_request", type: "decimal", value: "5.00" },
      { key: "tier", type: "string", value: "pro" },
      {
        key: "allowed_features",
        type: "set",
        value: "cache,streaming,analytics",
      },
    ],
    modelAccessRules: [
      { pattern: "openai/*", effect: "allow" },
      { pattern: "anthropic/claude-3.5-*", effect: "allow" },
      { pattern: "anthropic/claude-3-opus*", effect: "deny" },
    ],
    limits: [
      { key: "requests_per_minute", value: 60, window: "minute" },
      { key: "max_api_keys", value: 25 },
    ],
    featureFlags: ["beta_features", "advanced_analytics"],
    commercialTerms: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── State Machine Tests ─────────────────────────────────────

describe("Subscription State Machine", () => {
  it("allows trialing → active", () => {
    expect(validateTransition("trialing", "active")).toEqual({ valid: true });
  });

  it("allows active → paused", () => {
    expect(validateTransition("active", "paused")).toEqual({ valid: true });
  });

  it("allows paused → active (resume)", () => {
    expect(validateTransition("paused", "active")).toEqual({ valid: true });
  });

  it("allows active → cancelled", () => {
    expect(validateTransition("active", "cancelled")).toEqual({ valid: true });
  });

  it("denies cancelled → active (terminal state)", () => {
    const result = validateTransition("cancelled", "active");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("terminal state");
  });

  it("denies expired → active (terminal state)", () => {
    const result = validateTransition("expired", "active");
    expect(result.valid).toBe(false);
  });

  it("denies same-state transition", () => {
    const result = validateTransition("active", "active");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("already in");
  });

  it("denies trialing → paused (invalid path)", () => {
    const result = validateTransition("trialing", "paused");
    expect(result.valid).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminalState("cancelled")).toBe(true);
    expect(isTerminalState("expired")).toBe(true);
    expect(isTerminalState("active")).toBe(false);
    expect(isTerminalState("trialing")).toBe(false);
  });

  it("returns valid transitions for active state", () => {
    const transitions = getValidTransitions("active");
    expect(transitions).toContain("paused");
    expect(transitions).toContain("cancelled");
    expect(transitions).toContain("past_due");
    expect(transitions).toContain("expired");
    expect(transitions).not.toContain("trialing");
  });
});

// ─── Entitlement Resolver Tests ──────────────────────────────

describe("Entitlement Resolver", () => {
  it("resolves plan entitlements without overrides", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);

    expect(resolved.getInteger("max_workspaces")).toBe(10);
    expect(resolved.getBoolean("streaming_enabled")).toBe(true);
    expect(resolved.getDecimal("max_spend_per_request").toString()).toBe("5");
    expect(resolved.getString("tier")).toBe("pro");
    expect(resolved.getSet("allowed_features")).toEqual(
      new Set(["cache", "streaming", "analytics"]),
    );
  });

  it("overrides take precedence over plan defaults", () => {
    const pv = makePlanVersion();
    const overrides: EntitlementOverride[] = [
      {
        id: "eo_1",
        organizationId: "org_1",
        key: "max_workspaces",
        type: "integer",
        value: "50",
        reason: "Enterprise deal",
        createdBy: "admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const resolved = resolveEntitlements(pv, overrides);

    expect(resolved.getInteger("max_workspaces")).toBe(50);
    // Other entitlements unchanged
    expect(resolved.getBoolean("streaming_enabled")).toBe(true);
  });

  it("skips expired overrides", () => {
    const pv = makePlanVersion();
    const pastDate = new Date(Date.now() - 86400000);
    const overrides: EntitlementOverride[] = [
      {
        id: "eo_2",
        organizationId: "org_1",
        key: "max_workspaces",
        type: "integer",
        value: "999",
        reason: "Expired promo",
        expiresAt: pastDate,
        createdBy: "admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const resolved = resolveEntitlements(pv, overrides);

    // Should use plan default, not the expired override
    expect(resolved.getInteger("max_workspaces")).toBe(10);
  });

  it("returns defaults for missing entitlements", () => {
    const pv = makePlanVersion({ entitlements: [] });
    const resolved = resolveEntitlements(pv, []);

    expect(resolved.getBoolean("nonexistent")).toBe(false);
    expect(resolved.getInteger("nonexistent")).toBe(0);
    expect(resolved.getString("nonexistent")).toBe("");
    expect(resolved.getSet("nonexistent").size).toBe(0);
  });

  it("DENY_ALL_ENTITLEMENTS denies all model access", () => {
    const result = DENY_ALL_ENTITLEMENTS.checkModelAccess("openai/gpt-4o");
    expect(result.allowed).toBe(false);
  });

  it("preserves planVersionId and planId", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);
    expect(resolved.planVersionId).toBe("pv_test_1");
    expect(resolved.planId).toBe("plan_test_1");
  });

  it("has() and keys() work correctly", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);
    expect(resolved.has("max_workspaces")).toBe(true);
    expect(resolved.has("nonexistent")).toBe(false);
    expect(resolved.keys()).toContain("max_workspaces");
  });

  it("hasFeature() checks feature flags", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);
    expect(resolved.hasFeature("beta_features")).toBe(true);
    expect(resolved.hasFeature("nonexistent_feature")).toBe(false);
  });

  it("getLimit() returns plan limits", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);
    const limit = resolved.getLimit("requests_per_minute");
    expect(limit).toBeDefined();
    expect(limit!.value).toBe(60);
    expect(limit!.window).toBe("minute");
  });
});

// ─── Model Access Tests ──────────────────────────────────────

describe("Model Access Rules", () => {
  it("allows models matching allow rules", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);

    expect(resolved.checkModelAccess("openai/gpt-4o").allowed).toBe(true);
    expect(resolved.checkModelAccess("openai/gpt-4o-mini").allowed).toBe(true);
    expect(
      resolved.checkModelAccess("anthropic/claude-3.5-sonnet").allowed,
    ).toBe(true);
  });

  it("deny rules override allow rules", () => {
    const pv = makePlanVersion();
    const resolved = resolveEntitlements(pv, []);

    // claude-3-opus matches deny rule, even though anthropic/* could match an allow
    const result = resolved.checkModelAccess(
      "anthropic/claude-3-opus-20240229",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("denied by plan rule");
  });

  it("allows all models when no rules defined", () => {
    const pv = makePlanVersion({ modelAccessRules: [] });
    const resolved = resolveEntitlements(pv, []);

    expect(resolved.checkModelAccess("anything/any-model").allowed).toBe(true);
  });
});

// ─── Glob Matching Tests ─────────────────────────────────────

describe("Glob Matching", () => {
  it("matches exact strings", () => {
    expect(globMatch("openai/gpt-4o", "openai/gpt-4o")).toBe(true);
    expect(globMatch("openai/gpt-4o", "openai/gpt-4o-mini")).toBe(false);
  });

  it("matches wildcard suffix", () => {
    expect(globMatch("openai/*", "openai/gpt-4o")).toBe(true);
    expect(globMatch("openai/*", "openai/gpt-4o-mini")).toBe(true);
    expect(globMatch("openai/*", "anthropic/claude")).toBe(false);
  });

  it("matches wildcard prefix", () => {
    expect(globMatch("*/gpt-4o", "openai/gpt-4o")).toBe(true);
  });

  it("matches universal wildcard", () => {
    expect(globMatch("*", "anything")).toBe(true);
  });

  it("matches partial wildcard", () => {
    expect(
      globMatch("anthropic/claude-3.5-*", "anthropic/claude-3.5-sonnet"),
    ).toBe(true);
    expect(globMatch("anthropic/claude-3.5-*", "anthropic/claude-3-opus")).toBe(
      false,
    );
  });
});

// ─── Period Calculator Tests ─────────────────────────────────

describe("Period Calculator", () => {
  it("calculates initial monthly period", () => {
    const start = new Date("2024-01-15T00:00:00Z");
    const result = calculateInitialPeriod(start, "monthly");

    expect(result.periodStart).toEqual(start);
    expect(result.periodEnd.getUTCMonth()).toBe(1); // February
    expect(result.periodEnd.getUTCDate()).toBe(15);
    expect(result.periodNumber).toBe(1);
  });

  it("calculates initial annual period", () => {
    const start = new Date("2024-03-10T00:00:00Z");
    const result = calculateInitialPeriod(start, "annual");

    expect(result.periodStart).toEqual(start);
    expect(result.periodEnd.getUTCFullYear()).toBe(2025);
    expect(result.periodEnd.getUTCMonth()).toBe(2); // March
    expect(result.periodEnd.getUTCDate()).toBe(10);
    expect(result.periodNumber).toBe(1);
  });

  it("clamps day-of-month for short months (Jan 31 → Feb 28)", () => {
    const start = new Date("2024-01-31T00:00:00Z");
    const result = calculateInitialPeriod(start, "monthly");

    expect(result.periodEnd.getUTCMonth()).toBe(1); // February
    // 2024 is a leap year, so Feb has 29 days. Anchor is 31, clamped to 29.
    expect(result.periodEnd.getUTCDate()).toBe(29);
  });

  it("clamps day-of-month for non-leap year (Jan 31 → Feb 28)", () => {
    const start = new Date("2025-01-31T00:00:00Z");
    const result = calculateInitialPeriod(start, "monthly");

    expect(result.periodEnd.getUTCMonth()).toBe(1); // February
    // 2025 is NOT a leap year, so Feb has 28 days
    expect(result.periodEnd.getUTCDate()).toBe(28);
  });

  it("calculates next period from current", () => {
    const current = {
      periodStart: new Date("2024-01-15T00:00:00Z"),
      periodEnd: new Date("2024-02-15T00:00:00Z"),
      periodNumber: 1,
    };
    const anchor = new Date("2024-01-15T00:00:00Z");

    const next = calculateNextPeriod(current, "monthly", anchor);

    expect(next.periodStart).toEqual(new Date("2024-02-15T00:00:00Z"));
    expect(next.periodEnd.getUTCMonth()).toBe(2); // March
    expect(next.periodEnd.getUTCDate()).toBe(15);
    expect(next.periodNumber).toBe(2);
  });

  it("isPeriodExpired returns true when period has ended", () => {
    const past = { periodEnd: new Date("2024-01-01T00:00:00Z") };
    expect(isPeriodExpired(past, new Date("2024-06-01T00:00:00Z"))).toBe(true);
  });

  it("isPeriodExpired returns false when period is active", () => {
    const future = { periodEnd: new Date("2030-01-01T00:00:00Z") };
    expect(isPeriodExpired(future, new Date("2024-06-01T00:00:00Z"))).toBe(
      false,
    );
  });

  it("isWithinPeriod checks date boundaries correctly", () => {
    const period = {
      periodStart: new Date("2024-01-01T00:00:00Z"),
      periodEnd: new Date("2024-02-01T00:00:00Z"),
    };

    expect(isWithinPeriod(new Date("2024-01-15T00:00:00Z"), period)).toBe(true);
    expect(isWithinPeriod(new Date("2024-01-01T00:00:00Z"), period)).toBe(true); // inclusive start
    expect(isWithinPeriod(new Date("2024-02-01T00:00:00Z"), period)).toBe(
      false,
    ); // exclusive end
    expect(isWithinPeriod(new Date("2023-12-31T00:00:00Z"), period)).toBe(
      false,
    );
  });
});
