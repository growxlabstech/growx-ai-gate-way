import {
  routingDecisions,
  routingPolicies,
  routingPolicyVersions,
  type schema,
} from "@growx/database";
import { createPublicId } from "@growx/ids";
import { DEFAULT_GLOBAL_POLICY } from "@growx/routing";
import { eq, and, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  IRoutingRepository,
  RoutingDecisionListFilter,
} from "../application/repository.js";
import type { RoutingDecision, RoutingPolicy } from "../domain/types.js";

export class DatabaseRoutingRepository implements IRoutingRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async saveDecision(decision: RoutingDecision): Promise<void> {
    await this.db
      .insert(routingDecisions)
      .values({
        id: decision.id,
        requestId: decision.requestId,
        requestedModel: decision.canonicalModelId,
        resolvedModel: decision.canonicalModelId,
        providerId: decision.selectedProviderId,
        providerModelId: decision.selectedProviderModelId,
        routingPolicyVersionId: null,
        selectionReason: decision.reasons.join("; "),
        fallbackChain: decision.fallbackChain,
        createdAt: decision.decisionAt,
      })
      .onConflictDoNothing();
  }

  async getDecisionByRequestId(
    requestId: string,
  ): Promise<RoutingDecision | null> {
    const records = await this.db
      .select()
      .from(routingDecisions)
      .where(eq(routingDecisions.requestId, requestId))
      .limit(1);

    const record = records[0];
    if (!record) return null;

    return {
      id: record.id,
      requestId: record.requestId,
      strategy: "priority",
      canonicalModelId: record.requestedModel,
      selectedRouteId: "",
      selectedProviderId: record.providerId,
      selectedProviderModelId: record.providerModelId,
      candidateCount: 1,
      eligibleCandidateCount: 1,
      consideredRoutes: [],
      reasons: record.selectionReason ? record.selectionReason.split("; ") : [],
      fallbackChain: (record.fallbackChain as any) || [],
      decisionAt: record.createdAt,
    };
  }

  async getDecision(id: string): Promise<RoutingDecision | null> {
    const records = await this.db
      .select()
      .from(routingDecisions)
      .where(eq(routingDecisions.id, id))
      .limit(1);

    const record = records[0];
    if (!record) return null;

    return {
      id: record.id,
      requestId: record.requestId,
      strategy: "priority",
      canonicalModelId: record.requestedModel,
      selectedRouteId: "",
      selectedProviderId: record.providerId,
      selectedProviderModelId: record.providerModelId,
      candidateCount: 1,
      eligibleCandidateCount: 1,
      consideredRoutes: [],
      reasons: record.selectionReason ? record.selectionReason.split("; ") : [],
      fallbackChain: (record.fallbackChain as any) || [],
      decisionAt: record.createdAt,
    };
  }

  async listDecisions(
    filter?: RoutingDecisionListFilter | undefined,
  ): Promise<RoutingDecision[]> {
    const limit = filter?.limit ?? 50;
    const records = await this.db.select().from(routingDecisions).limit(limit);

    return records.map((record) => ({
      id: record.id,
      requestId: record.requestId,
      strategy: "priority",
      canonicalModelId: record.requestedModel,
      selectedRouteId: "",
      selectedProviderId: record.providerId,
      selectedProviderModelId: record.providerModelId,
      candidateCount: 1,
      eligibleCandidateCount: 1,
      consideredRoutes: [],
      reasons: record.selectionReason ? record.selectionReason.split("; ") : [],
      fallbackChain: (record.fallbackChain as any) || [],
      decisionAt: record.createdAt,
    }));
  }

  async getPolicy(
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
  ): Promise<RoutingPolicy | null> {
    const conditions = [];
    if (organizationId) {
      conditions.push(eq(routingPolicies.organizationId, organizationId));
    } else {
      conditions.push(isNull(routingPolicies.organizationId));
    }

    if (workspaceId) {
      conditions.push(eq(routingPolicies.workspaceId, workspaceId));
    } else {
      conditions.push(isNull(routingPolicies.workspaceId));
    }

    const records = await this.db
      .select()
      .from(routingPolicies)
      .where(and(...conditions))
      .limit(1);

    const pol = records[0];
    if (!pol) return null;

    // Fetch latest policy version
    const versionRecords = await this.db
      .select()
      .from(routingPolicyVersions)
      .where(eq(routingPolicyVersions.routingPolicyId, pol.id))
      .orderBy(routingPolicyVersions.createdAt)
      .limit(1);

    const ver = versionRecords[0];
    const config = (ver?.configuration as any) || {};

    return {
      id: pol.id,
      organizationId: pol.organizationId,
      workspaceId: pol.workspaceId,
      name: pol.name,
      enabled: pol.enabled,
      strategy: config.strategy || "priority",
      allowedProviders: config.allowedProviders,
      deniedProviders: config.deniedProviders,
      allowedRegions: config.allowedRegions,
      deniedRegions: config.deniedRegions,
      preferredProviders: config.preferredProviders,
      dataRegion: config.dataRegion,
      requiredRegion: config.requiredRegion,
      maxEstimatedProviderCost: config.maxEstimatedProviderCost,
      weights: config.weights,
      sticky: config.sticky,
      version: ver ? Number(ver.version) || 1 : 1,
      createdAt: pol.createdAt,
      updatedAt: pol.updatedAt,
    };
  }

  async getPolicyById(id: string): Promise<RoutingPolicy | null> {
    const records = await this.db
      .select()
      .from(routingPolicies)
      .where(eq(routingPolicies.id, id))
      .limit(1);

    const pol = records[0];
    if (!pol) return null;

    const versionRecords = await this.db
      .select()
      .from(routingPolicyVersions)
      .where(eq(routingPolicyVersions.routingPolicyId, pol.id))
      .orderBy(routingPolicyVersions.createdAt)
      .limit(1);

    const ver = versionRecords[0];
    const config = (ver?.configuration as any) || {};

    return {
      id: pol.id,
      organizationId: pol.organizationId,
      workspaceId: pol.workspaceId,
      name: pol.name,
      enabled: pol.enabled,
      strategy: config.strategy || "priority",
      allowedProviders: config.allowedProviders,
      deniedProviders: config.deniedProviders,
      allowedRegions: config.allowedRegions,
      deniedRegions: config.deniedRegions,
      preferredProviders: config.preferredProviders,
      dataRegion: config.dataRegion,
      requiredRegion: config.requiredRegion,
      maxEstimatedProviderCost: config.maxEstimatedProviderCost,
      weights: config.weights,
      sticky: config.sticky,
      version: ver ? Number(ver.version) || 1 : 1,
      createdAt: pol.createdAt,
      updatedAt: pol.updatedAt,
    };
  }

  async savePolicy(policy: RoutingPolicy): Promise<void> {
    const policyId = policy.id || createPublicId("pol");

    await this.db.transaction(async (tx) => {
      await tx
        .insert(routingPolicies)
        .values({
          id: policyId,
          organizationId: policy.organizationId || null,
          workspaceId: policy.workspaceId || null,
          name: policy.name,
          enabled: policy.enabled,
          createdAt: policy.createdAt || new Date(),
          updatedAt: policy.updatedAt || new Date(),
        })
        .onConflictDoNothing();

      await tx.insert(routingPolicyVersions).values({
        id: createPublicId("rpv"),
        routingPolicyId: policyId,
        version: String(policy.version || 1),
        configuration: {
          strategy: policy.strategy,
          allowedProviders: policy.allowedProviders,
          deniedProviders: policy.deniedProviders,
          allowedRegions: policy.allowedRegions,
          deniedRegions: policy.deniedRegions,
          preferredProviders: policy.preferredProviders,
          dataRegion: policy.dataRegion,
          requiredRegion: policy.requiredRegion,
          maxEstimatedProviderCost: policy.maxEstimatedProviderCost,
          weights: policy.weights,
          sticky: policy.sticky,
        },
        effectiveFrom: new Date(),
      });
    });
  }

  async updatePolicy(
    id: string,
    updates: Partial<RoutingPolicy>,
  ): Promise<void> {
    const existing = await this.getPolicyById(id);
    if (!existing) return;

    const merged = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    await this.db.transaction(async (tx) => {
      await tx
        .update(routingPolicies)
        .set({
          name: merged.name,
          enabled: merged.enabled,
          updatedAt: merged.updatedAt,
        })
        .where(eq(routingPolicies.id, id));

      await tx.insert(routingPolicyVersions).values({
        id: createPublicId("rpv"),
        routingPolicyId: id,
        version: String(merged.version),
        configuration: {
          strategy: merged.strategy,
          allowedProviders: merged.allowedProviders,
          deniedProviders: merged.deniedProviders,
          allowedRegions: merged.allowedRegions,
          deniedRegions: merged.deniedRegions,
          preferredProviders: merged.preferredProviders,
          dataRegion: merged.dataRegion,
          requiredRegion: merged.requiredRegion,
          maxEstimatedProviderCost: merged.maxEstimatedProviderCost,
          weights: merged.weights,
          sticky: merged.sticky,
        },
        effectiveFrom: new Date(),
      });
    });
  }

  async listPolicies(scope?: {
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<RoutingPolicy[]> {
    const conditions = [];
    if (scope?.organizationId) {
      conditions.push(eq(routingPolicies.organizationId, scope.organizationId));
    }
    if (scope?.workspaceId) {
      conditions.push(eq(routingPolicies.workspaceId, scope.workspaceId));
    }

    const records = await this.db
      .select()
      .from(routingPolicies)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const results: RoutingPolicy[] = [];
    for (const pol of records) {
      const p = await this.getPolicyById(pol.id);
      if (p) results.push(p);
    }
    return results;
  }

  async getGlobalPolicy(): Promise<RoutingPolicy | null> {
    const records = await this.db
      .select()
      .from(routingPolicies)
      .where(
        and(
          isNull(routingPolicies.organizationId),
          isNull(routingPolicies.workspaceId),
        ),
      )
      .limit(1);

    if (records.length === 0) {
      return { ...DEFAULT_GLOBAL_POLICY };
    }
    return this.getPolicyById(records[0]!.id);
  }

  async saveGlobalPolicy(policy: RoutingPolicy): Promise<void> {
    await this.savePolicy({
      ...policy,
      organizationId: null,
      workspaceId: null,
    });
  }
}
