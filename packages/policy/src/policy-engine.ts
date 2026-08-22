import type {
  BatchRoutePolicyEvaluationResult,
  EffectivePolicy,
  EffectivePolicyConstraints,
  PolicyDecision,
  PolicyDefinition,
  PolicyEntity,
  PolicyEvaluationContext,
  PolicyRule,
  PolicyScopeType,
  PolicyVersionEntity,
  RouteCandidateForPolicy,
} from "./types.js";
import type { ModelRule } from "@growx/contracts";
import {
  compileEffectivePolicy,
  type PolicyHierarchyItem,
} from "./policy-compiler.js";
import { evaluateRequestPolicy, evaluateRoutesBatch } from "./evaluator.js";
import type {
  CreatePolicyInput,
  IPolicyRepository,
  UpdatePolicyInput,
} from "./policy-repository.js";
import type { IPolicyCache } from "./policy-cache.js";

export interface PolicyEngineEvents {
  emitAudit?(
    type: string,
    data: Record<string, unknown>,
    actorId?: string,
  ): Promise<void> | void;
  emitSecurity?(
    type: string,
    severity: string,
    data: Record<string, unknown>,
    requestId?: string,
  ): Promise<void> | void;
  emitOutbox?(
    type: string,
    data: Record<string, unknown>,
  ): Promise<void> | void;
}

export interface PolicyEngineOptions {
  cache?: IPolicyCache | undefined;
  events?: PolicyEngineEvents | undefined;
}

export class PolicyEngine {
  private readonly cache?: IPolicyCache | undefined;
  private readonly events?: PolicyEngineEvents | undefined;

  constructor(
    public readonly repository: IPolicyRepository,
    options?: PolicyEngineOptions,
  ) {
    this.cache = options?.cache;
    this.events = options?.events;
  }

  /**
   * Resolves, compiles, and caches the EffectivePolicy for a given tenant/API key scope.
   */
  async getEffectivePolicy(
    organizationId: string,
    workspaceId: string,
    apiKeyId?: string | undefined,
    options?: {
      requestConstraints?: Partial<EffectivePolicyConstraints> | undefined;
      apiKeyModelRules?: readonly ModelRule[] | ModelRule[] | undefined;
      skipCache?: boolean | undefined;
    },
  ): Promise<EffectivePolicy> {
    const cacheKey = `${organizationId}:${workspaceId}:${apiKeyId ?? "none"}`;

    if (!options?.skipCache && this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        if (options?.requestConstraints) {
          // Recompile with ephemeral request constraints on top of cached policy
          return compileEffectivePolicy(
            [
              {
                scopeType: "global",
                policyId: "cached",
                version: 1,
                definition: { rules: cached.rules },
              },
            ],
            options.requestConstraints,
          );
        }
        return cached;
      }
    }

    const hierarchy: PolicyHierarchyItem[] = [];

    // 1. Global Policy
    const globalPolicy = await this.repository.getPolicyByScope("global", null);
    if (globalPolicy && globalPolicy.status === "active") {
      const globalVersion = await this.repository.getActiveVersion(
        globalPolicy.id,
      );
      if (globalVersion) {
        hierarchy.push({
          scopeType: "global",
          scopeId: null,
          policyId: globalPolicy.id,
          version: globalVersion.version,
          definition: globalVersion.definition,
        });
      }
    }

    // 2. Organization Policy
    if (organizationId) {
      const orgPolicy = await this.repository.getPolicyByScope(
        "organization",
        organizationId,
      );
      if (orgPolicy && orgPolicy.status === "active") {
        const orgVersion = await this.repository.getActiveVersion(orgPolicy.id);
        if (orgVersion) {
          hierarchy.push({
            scopeType: "organization",
            scopeId: organizationId,
            policyId: orgPolicy.id,
            version: orgVersion.version,
            definition: orgVersion.definition,
          });
        }
      }
    }

    // 3. Workspace Policy
    if (workspaceId) {
      const wsPolicy = await this.repository.getPolicyByScope(
        "workspace",
        workspaceId,
      );
      if (wsPolicy && wsPolicy.status === "active") {
        const wsVersion = await this.repository.getActiveVersion(wsPolicy.id);
        if (wsVersion) {
          hierarchy.push({
            scopeType: "workspace",
            scopeId: workspaceId,
            policyId: wsPolicy.id,
            version: wsVersion.version,
            definition: wsVersion.definition,
          });
        }
      }
    }

    // 4. API Key Policy / Model Rules
    if (apiKeyId) {
      const apiKeyPolicy = await this.repository.getPolicyByScope(
        "api_key",
        apiKeyId,
      );
      if (apiKeyPolicy && apiKeyPolicy.status === "active") {
        const keyVersion = await this.repository.getActiveVersion(
          apiKeyPolicy.id,
        );
        if (keyVersion) {
          hierarchy.push({
            scopeType: "api_key",
            scopeId: apiKeyId,
            policyId: apiKeyPolicy.id,
            version: keyVersion.version,
            definition: keyVersion.definition,
          });
        }
      }

      // Convert Phase-3 apiKeyModelRules into an API-Key level policy if provided
      if (options?.apiKeyModelRules && options.apiKeyModelRules.length > 0) {
        const rules: PolicyRule[] = options.apiKeyModelRules.map((r, idx) => ({
          id: r.id ?? `ak_rule_${idx}`,
          target: "model",
          effect: r.effect,
          operator: r.pattern.includes("*") ? "contains" : "equals",
          value: r.pattern.replace(/\*/g, ""),
        }));

        hierarchy.push({
          scopeType: "api_key",
          scopeId: apiKeyId,
          policyId: `pol_virtual_key_${apiKeyId}`,
          version: 1,
          definition: { rules },
        });
      }
    }

    const effective = compileEffectivePolicy(
      hierarchy,
      options?.requestConstraints,
    );

    if (this.cache) {
      await this.cache.set(cacheKey, effective);
    }

    return effective;
  }

  /**
   * Evaluates request against governing policies before technical routing or provider execution.
   */
  async evaluateRequest(
    context: PolicyEvaluationContext,
    options?: {
      requestConstraints?: Partial<EffectivePolicyConstraints> | undefined;
      apiKeyModelRules?: readonly ModelRule[] | ModelRule[] | undefined;
    },
  ): Promise<PolicyDecision> {
    const effectivePolicy = await this.getEffectivePolicy(
      context.organizationId,
      context.workspaceId,
      context.apiKeyId,
      {
        requestConstraints: options?.requestConstraints,
        apiKeyModelRules: options?.apiKeyModelRules,
      },
    );

    const decision = evaluateRequestPolicy(context, effectivePolicy);

    if (!decision.allowed) {
      await this.events?.emitSecurity?.(
        "security.policy.violation",
        "medium",
        {
          denialCode: decision.denialCode,
          reasons: decision.reasons,
          canonicalModelId: context.canonicalModel.canonicalId,
          workspaceId: context.workspaceId,
          apiKeyId: context.apiKeyId,
        },
        context.metadata?.requestId as string,
      );
    }

    return decision;
  }

  /**
   * Batch filters candidate routes against effective governance policy.
   */
  async evaluateRoutes(
    context: PolicyEvaluationContext,
    candidates: RouteCandidateForPolicy[],
    options?: {
      requestConstraints?: Partial<EffectivePolicyConstraints> | undefined;
      apiKeyModelRules?: readonly ModelRule[] | ModelRule[] | undefined;
    },
  ): Promise<BatchRoutePolicyEvaluationResult> {
    const effectivePolicy = await this.getEffectivePolicy(
      context.organizationId,
      context.workspaceId,
      context.apiKeyId,
      {
        requestConstraints: options?.requestConstraints,
        apiKeyModelRules: options?.apiKeyModelRules,
      },
    );

    return evaluateRoutesBatch(candidates, context, effectivePolicy);
  }

  /**
   * Simulates policy evaluation for UI or administrative preview without provider calls or side-effects.
   */
  async simulatePolicy(
    context: PolicyEvaluationContext,
    candidates?: RouteCandidateForPolicy[],
  ): Promise<{
    requestDecision: PolicyDecision;
    routeEvaluation?: BatchRoutePolicyEvaluationResult | undefined;
    effectiveConstraints: EffectivePolicyConstraints;
  }> {
    const effectivePolicy = await this.getEffectivePolicy(
      context.organizationId,
      context.workspaceId,
      context.apiKeyId,
    );

    const requestDecision = evaluateRequestPolicy(context, effectivePolicy);
    const routeEvaluation = candidates
      ? evaluateRoutesBatch(candidates, context, effectivePolicy)
      : undefined;

    return {
      requestDecision,
      routeEvaluation,
      effectiveConstraints: effectivePolicy.constraints,
    };
  }

  // ─── Lifecycle Operations with Invalidation ───

  async createPolicy(
    input: CreatePolicyInput,
    actorId: string,
  ): Promise<{ policy: PolicyEntity; version: PolicyVersionEntity }> {
    const res = await this.repository.createPolicy(input);

    await this.invalidateScope(input.scopeType, input.scopeId);

    await this.events?.emitAudit?.(
      "policy.created",
      {
        policyId: res.policy.id,
        scopeType: res.policy.scopeType,
        scopeId: res.policy.scopeId,
        version: res.version.version,
      },
      actorId,
    );

    await this.events?.emitOutbox?.("policy.created", {
      policyId: res.policy.id,
      scopeType: res.policy.scopeType,
      scopeId: res.policy.scopeId,
    });

    return res;
  }

  async updatePolicy(
    id: string,
    input: UpdatePolicyInput,
    actorId: string,
  ): Promise<PolicyEntity> {
    const updated = await this.repository.updatePolicy(id, input, actorId);

    await this.invalidateScope(updated.scopeType, updated.scopeId);

    await this.events?.emitAudit?.(
      "policy.updated",
      {
        policyId: updated.id,
        scopeType: updated.scopeType,
        scopeId: updated.scopeId,
        status: updated.status,
      },
      actorId,
    );

    await this.events?.emitOutbox?.("policy.updated", {
      policyId: updated.id,
      scopeType: updated.scopeType,
      scopeId: updated.scopeId,
    });

    return updated;
  }

  async createVersion(
    policyId: string,
    definition: PolicyDefinition,
    actorId: string,
  ): Promise<PolicyVersionEntity> {
    const version = await this.repository.createVersion(
      policyId,
      definition,
      actorId,
    );

    const policy = await this.repository.getPolicy(policyId);
    if (policy) {
      await this.invalidateScope(policy.scopeType, policy.scopeId);
    }

    await this.events?.emitAudit?.(
      "policy.version.created",
      {
        policyId,
        version: version.version,
      },
      actorId,
    );

    return version;
  }

  async activateVersion(
    policyId: string,
    versionNumber: number,
    actorId: string,
  ): Promise<PolicyEntity> {
    const updated = await this.repository.activateVersion(
      policyId,
      versionNumber,
      actorId,
    );

    await this.invalidateScope(updated.scopeType, updated.scopeId);

    await this.events?.emitAudit?.(
      "policy.activated",
      {
        policyId: updated.id,
        scopeType: updated.scopeType,
        scopeId: updated.scopeId,
        activeVersion: updated.activeVersion,
      },
      actorId,
    );

    await this.events?.emitOutbox?.("policy.activated", {
      policyId: updated.id,
      scopeType: updated.scopeType,
      scopeId: updated.scopeId,
      activeVersion: updated.activeVersion,
    });

    return updated;
  }

  private async invalidateScope(
    scopeType: PolicyScopeType,
    scopeId?: string | null,
  ): Promise<void> {
    if (!this.cache) return;

    if (scopeType === "global") {
      await this.cache.invalidateGlobal();
    } else if (scopeType === "organization" && scopeId) {
      await this.cache.invalidateOrganization(scopeId);
    } else if (scopeType === "workspace" && scopeId) {
      await this.cache.invalidateWorkspace(scopeId);
    } else if (scopeType === "api_key" && scopeId) {
      await this.cache.invalidateApiKey(scopeId);
    }
  }
}
