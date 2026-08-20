import type { ResolvedEntitlements } from "@growx/subscriptions";
import { DENY_ALL_ENTITLEMENTS } from "@growx/subscriptions";

/**
 * Result of an entitlement access check.
 */
export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  resolvedPlan?: string;
  entitlements?: ResolvedEntitlements;
}

/**
 * Interface for resolving entitlements. The gateway only depends on this interface,
 * not on the full SubscriptionService directly.
 */
export interface IEntitlementResolver {
  resolveEntitlements(organizationId: string): Promise<ResolvedEntitlements>;
}

/**
 * Gateway entitlement gate. Checks whether an organization's subscription plan
 * allows access to the requested model before proceeding to policy, quota,
 * pricing, and wallet checks.
 *
 * Fail-closed: if entitlement resolution fails, access is denied.
 */
export class EntitlementGate {
  constructor(
    private readonly resolver: IEntitlementResolver,
  ) {}

  /**
   * Check whether the organization's plan allows access to the requested model.
   */
  async checkAccess(params: {
    organizationId: string;
    canonicalModelId: string;
    workspaceId?: string;
  }): Promise<EntitlementCheckResult> {
    try {
      const entitlements = await this.resolver.resolveEntitlements(params.organizationId);

      // Check model access rules
      const modelCheck = entitlements.checkModelAccess(params.canonicalModelId);
      if (!modelCheck.allowed) {
        return {
          allowed: false,
          reason: modelCheck.reason ?? `Model ${params.canonicalModelId} is not available on your current plan`,
          resolvedPlan: entitlements.planId,
          entitlements,
        };
      }

      return {
        allowed: true,
        resolvedPlan: entitlements.planId,
        entitlements,
      };
    } catch {
      // Fail closed
      return {
        allowed: false,
        reason: "Entitlement resolution failed — access denied (fail-closed)",
      };
    }
  }
}
