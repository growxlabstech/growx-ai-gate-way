import type {
  EntitlementDefinition,
  EntitlementOverride,
  ModelAccessRule,
  PlanLimit,
  PlanVersion,
} from "./types.js";
import { ResolvedEntitlements, DENY_ALL_ENTITLEMENTS } from "./types.js";

/**
 * Merges a PlanVersion's entitlements with organization-level overrides
 * to produce a ResolvedEntitlements instance.
 *
 * Override precedence: overrides always win over plan defaults.
 * Fail-closed: if resolution throws, returns DENY_ALL_ENTITLEMENTS.
 */
export function resolveEntitlements(
  planVersion: PlanVersion,
  overrides: readonly EntitlementOverride[] = [],
): ResolvedEntitlements {
  try {
    const now = new Date();
    const merged = new Map<string, EntitlementDefinition>();

    // 1. Start with plan entitlements as base
    for (const ent of planVersion.entitlements) {
      merged.set(ent.key, { ...ent });
    }

    // 2. Apply overrides (overrides take precedence)
    for (const override of overrides) {
      // Skip expired overrides
      if (override.expiresAt && override.expiresAt < now) {
        continue;
      }

      merged.set(override.key, {
        key: override.key,
        type: override.type,
        value: override.value,
        description: `Override: ${override.reason}`,
      });
    }

    return new ResolvedEntitlements(
      merged,
      planVersion.modelAccessRules,
      planVersion.limits,
      new Set(planVersion.featureFlags),
      planVersion.id,
      planVersion.planId,
    );
  } catch {
    // Fail closed: deny all on resolution failure
    return DENY_ALL_ENTITLEMENTS;
  }
}

/**
 * Merges model access rules from plan and overrides.
 * Currently overrides don't modify model access rules —
 * that's handled at the plan version level.
 * This function exists for future extensibility.
 */
export function mergeModelAccessRules(
  planRules: readonly ModelAccessRule[],
  _overrideRules?: readonly ModelAccessRule[],
): readonly ModelAccessRule[] {
  // For now, plan rules are authoritative.
  // Override rules could be merged here in the future.
  return planRules;
}
