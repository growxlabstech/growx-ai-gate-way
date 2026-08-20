import type {
  DataCategory,
  RetentionPolicy,
} from "@growx/contracts";
import type { IGovernanceRepository } from "./repository.js";

export interface PolicyResolutionContext {
  organizationId?: string;
  workspaceId?: string;
  category: DataCategory;
  resourceId?: string;
}

export class GovernancePolicyResolver {
  constructor(private repository: IGovernanceRepository) {}

  public async resolvePolicy(ctx: PolicyResolutionContext): Promise<RetentionPolicy> {
    // Deterministic Precedence:
    // 1. Specific Resource Policy
    // 2. Category within Workspace
    // 3. Workspace default
    // 4. Category within Organization
    // 5. Organization default
    // 6. Platform default

    const allPolicies = await this.repository.listPolicies();

    // 1. Resource specific
    if (ctx.resourceId) {
      const resPolicy = allPolicies.find(
        (p) => p.scope === "resource" && p.scopeId === ctx.resourceId
      );
      if (resPolicy) return resPolicy;
    }

    // 2. Category within Workspace
    if (ctx.workspaceId) {
      const wsCatPolicy = allPolicies.find(
        (p) => p.scope === "workspace" && p.scopeId === ctx.workspaceId && p.category === ctx.category
      );
      if (wsCatPolicy) return wsCatPolicy;

      // 3. Workspace default
      const wsPolicy = allPolicies.find(
        (p) => p.scope === "workspace" && p.scopeId === ctx.workspaceId && !p.category
      );
      if (wsPolicy) return wsPolicy;
    }

    // 4. Category within Organization
    if (ctx.organizationId) {
      const orgCatPolicy = allPolicies.find(
        (p) => p.scope === "organization" && p.scopeId === ctx.organizationId && p.category === ctx.category
      );
      if (orgCatPolicy) return orgCatPolicy;

      // 5. Organization default
      const orgPolicy = allPolicies.find(
        (p) => p.scope === "organization" && p.scopeId === ctx.organizationId && !p.category
      );
      if (orgPolicy) return orgPolicy;
    }

    // 6. Category platform default
    const catDefault = allPolicies.find(
      (p) => p.scope === "category" && p.category === ctx.category
    );
    if (catDefault) return catDefault;

    // 7. Platform global fallback
    const platformDefault = allPolicies.find((p) => p.scope === "platform_default");
    if (platformDefault) return platformDefault;

    // Built-in absolute default: 30 days retention for customer content
    return {
      id: "ret_default_builtin",
      scope: "platform_default",
      durationDays: 30,
      action: "DELETE",
      priority: 1,
      version: 1,
      status: "active",
      createdAt: new Date(0),
    };
  }

  public calculateExpirationDate(policy: RetentionPolicy, fromDate: Date = new Date()): Date | null {
    if (policy.durationDays === 0) {
      return fromDate; // Zero retention
    }
    return new Date(fromDate.getTime() + policy.durationDays * 86400 * 1000);
  }
}
