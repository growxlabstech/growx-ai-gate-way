import {
  GrowXProviderError,
  type CanonicalCapability,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";
import type {
  CanonicalModelEntity,
  ModelRegistryService,
  ProviderRouteEntity,
} from "@growx/model-registry-service";
import type { ProviderService } from "@growx/provider-service";
import {
  DEFAULT_GLOBAL_POLICY,
  calculateEstimatedCost,
  evaluateEligibility,
  mergeRoutingPolicies,
  rankCandidates,
  type ConsideredRoute,
  type ExclusionReasonCode,
  type RankedCandidate,
  type RouteCandidate,
  type RouteScore,
  type RouteTarget,
  type RoutingDecision,
  type RoutingPolicy,
  type RoutingRequest,
  type IRouteHealthStore,
} from "@growx/routing";
import type { PolicyEngine } from "@growx/policy";
import type {
  IAvailabilitySignalProvider,
  ICapacitySignalProvider,
  ILatencySignalProvider,
} from "../domain/signals.js";
import type {
  ResolvedGatewayRoute,
  RoutingEngineContext,
} from "../domain/types.js";
import type { IRoutingEvents } from "./events.js";
import type { IRoutingRepository } from "./repository.js";

export interface RoutingEngineOptions {
  routeHealthStore?: IRouteHealthStore | undefined;
  latencySignalProvider?: ILatencySignalProvider | undefined;
  availabilitySignalProvider?: IAvailabilitySignalProvider | undefined;
  capacitySignalProvider?: ICapacitySignalProvider | undefined;
  policyEngine?: PolicyEngine | undefined;
  idGenerator?: (() => string) | undefined;
}

export class RoutingEngine {
  private readonly healthStore?: IRouteHealthStore | undefined;
  private readonly latencyProvider?: ILatencySignalProvider | undefined;
  private readonly availabilityProvider?: IAvailabilitySignalProvider | undefined;
  private readonly capacityProvider?: ICapacitySignalProvider | undefined;
  public readonly policyEngine?: PolicyEngine | undefined;
  private readonly idGenerator: () => string;

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerService: ProviderService,
    private readonly repository: IRoutingRepository,
    private readonly events: IRoutingEvents,
    options: RoutingEngineOptions = {}
  ) {
    this.healthStore = options.routeHealthStore;
    this.latencyProvider = options.latencySignalProvider;
    this.availabilityProvider = options.availabilitySignalProvider;
    this.capacityProvider = options.capacitySignalProvider;
    this.policyEngine = options.policyEngine;
    this.idGenerator = options.idGenerator ?? (() => createPublicId("dec"));
  }

  /**
   * Route a request through the intelligent routing pipeline:
   * 1. Fetch effective policy hierarchy (Global -> Org -> Workspace -> API Key -> Request)
   * 2. Build RouteCandidate objects with metadata, pricing, latency, availability
   * 3. Evaluate Hard Eligibility Filters (recording exclusion reasons)
   * 4. If no eligible candidates -> throw NO_ELIGIBLE_ROUTE (503)
   * 5. Rank eligible candidates using configured strategy
   * 6. Construct and persist RoutingDecision
   * 7. Return selected route and decision
   */
  async route(context: RoutingEngineContext): Promise<{
    decision: RoutingDecision;
    selectedRoute: ProviderRouteEntity;
    canonicalModel: CanonicalModelEntity;
    resolvedRoute: ResolvedGatewayRoute;
  }> {
    const startTime = Date.now();
    const { model, eligibleConfiguredRoutes, requestedModelId, activeAlias } =
      context.resolvedModel as any;

    // 1. Resolve Effective Routing Policy
    const effectivePolicy = await this.resolveEffectivePolicy(
      context.auth.organizationId,
      context.auth.workspaceId,
      context.constraints
    );

    // 2. Fetch Providers Metadata
    const allProviders: any[] = await this.providerService.listProviders().catch(() => []);

    const activeEnv = context.auth.environment || "development";

    // Batch fetch health snapshots for all eligible routes
    const routeIds = (eligibleConfiguredRoutes as ProviderRouteEntity[]).map((r) => r.id);
    const healthSnapshots = this.healthStore
      ? await this.healthStore.getRouteHealthBatch(routeIds).catch(() => new Map())
      : new Map();

    // Batch fetch capacity signals for all eligible routes
    const capacitySignals: Map<string, any> =
      (this.capacityProvider as any)?.getCapacitySignals
        ? await (this.capacityProvider as any)
            .getCapacitySignals(
              (eligibleConfiguredRoutes as ProviderRouteEntity[]).map((r) => ({
                routeId: r.id,
                providerId: r.providerId,
              }))
            )
            .catch(() => new Map())
        : new Map();

    // 3. Build RouteCandidate[]
    const candidates: RouteCandidate[] = await Promise.all(
      (eligibleConfiguredRoutes as ProviderRouteEntity[]).map(async (route) => {
        const provider = allProviders.find((p: any) => p.id === route.providerId);
        const providerStatus = provider ? (provider.enabled ? provider.status : "disabled") : "disabled";

        // Check if provider has active credentials for this environment
        let hasCred = true;
        try {
          const creds = await this.providerService.listCredentials(route.providerId);
          hasCred = creds.some(
            (c: any) =>
              c.status === "active" &&
              (c.environment === activeEnv || c.environment === "production" || !c.environment)
          );
        } catch {
          hasCred = false;
        }

        // Fetch pricing for this route or model
        const routePrice =
          (await this.modelRegistry.getEffectivePricing(route.id).catch(() => null)) ||
          (await this.modelRegistry.getEffectivePricing(model.id).catch(() => null)) ||
          (await this.modelRegistry.getEffectivePricing(model.canonicalId).catch(() => null));

        // Fetch signals
        const [latencySignal, availabilitySignal] = await Promise.all([
          this.latencyProvider
            ? this.latencyProvider.getLatencySignal(
                route.providerId,
                route.providerModelId,
                route.region
              )
            : null,
          this.availabilityProvider
            ? this.availabilityProvider.getAvailabilitySignal(
                route.providerId,
                route.providerModelId
              )
            : null,
        ]);

        const capacitySignal =
          capacitySignals.get(route.id) ??
          (this.capacityProvider
            ? await this.capacityProvider
                .getCapacitySignal(route.providerId, route.providerModelId)
                .catch(() => null)
            : null);

        // Effective capabilities for route (considering overrides)
        const capabilities =
          route.capabilitiesOverrides && route.capabilitiesOverrides.length > 0
            ? route.capabilitiesOverrides
            : model.capabilities;

        const limits = {
          contextWindow: route.contextWindowOverride ?? model.contextWindow,
          maxOutputTokens: route.maxOutputTokensOverride ?? model.maxOutputTokens,
          maxInputTokens: model.maxInputTokens ?? null,
        };

        const pricing = routePrice
          ? {
              inputPricePerMillionMinor: routePrice.inputPricePerMillionMinor,
              outputPricePerMillionMinor: routePrice.outputPricePerMillionMinor,
              cachedInputPricePerMillionMinor: routePrice.cachedInputPricePerMillionMinor,
              reasoningPricePerMillionMinor: routePrice.reasoningPricePerMillionMinor,
              currency: routePrice.currency,
            }
          : undefined;

        const health = healthSnapshots.get(route.id);
        const circuitState = health?.circuitState ?? "CLOSED";
        const healthState = health?.state ?? "unknown";

        const capUtil =
          capacitySignal?.utilization !== undefined
            ? capacitySignal.utilization
            : capacitySignal?.headroom !== undefined
            ? Math.max(0, 1 - capacitySignal.headroom)
            : undefined;

        const candidate: RouteCandidate = {
          routeId: route.id,
          providerId: route.providerId,
          providerModelId: route.providerModelId,
          publicModelId: `${route.providerId}/${route.providerModelId}`,
          region: route.region,
          priority: route.priority,
          weight: 100, // Default weight
          capabilities,
          limits,
          routeStatus: route.status,
          providerStatus,
          routingEligible: route.routingEligible,
          hasActiveCredential: hasCred,
          pricing,
          circuit: circuitState,
          health: healthState,
          reliability: health ? health.availabilityScore / 100 : undefined,
          capacityState: capacitySignal?.state,
          capacityUtilization: capUtil,
          latencySignal: latencySignal
            ? {
                p95LatencyMs: latencySignal.p95LatencyMs,
                p50LatencyMs: latencySignal.p50LatencyMs,
                source: latencySignal.source,
                sampledAt: latencySignal.sampledAt,
              }
            : health?.latency.p95LatencyMs
            ? {
                p95LatencyMs: health.latency.p95LatencyMs,
                p50LatencyMs: health.latency.p50LatencyMs,
                source: "telemetry",
              }
            : undefined,
          availabilitySignal: availabilitySignal
            ? {
                available: availabilitySignal.available,
                successRate: availabilitySignal.successRate,
                source: availabilitySignal.source,
              }
            : health
            ? {
                available: circuitState === "CLOSED" || circuitState === "HALF_OPEN",
                successRate: health.successRate,
                source: "telemetry",
              }
            : undefined,
          capacitySignal: capacitySignal
            ? {
                utilization: capUtil ?? 0,
                state: capacitySignal.state,
              }
            : undefined,
        };

        return candidate;
      })
    );

    // 4. Create RoutingRequest DTO
    const routingRequest: RoutingRequest = {
      requestId: context.requestId,
      organizationId: context.auth.organizationId,
      workspaceId: context.auth.workspaceId,
      environmentId: context.auth.environmentId,
      apiKeyId: context.auth.apiKeyId,
      requestedModel: requestedModelId,
      canonicalModelId: model.canonicalId,
      capabilities: context.requiredCapabilities,
      stream: context.stream,
      estimatedInputTokens: context.estimatedInputTokens ?? 1000,
      estimatedOutputTokens: context.estimatedOutputTokens ?? 500,
      stableKey: context.stableKey ?? context.auth.workspaceId,
      constraints: context.constraints,
      hints: context.hints,
    };

    // 5. Evaluate Eligibility and Policy for all Candidates
    const consideredRoutes: ConsideredRoute[] = [];
    const eligibleCandidates: RouteCandidate[] = [];

    const policyExcludedMap = new Map<string, { reason: string; code: ExclusionReasonCode }>();
    if (this.policyEngine) {
      try {
        const policyBatchRes = await this.policyEngine.evaluateRoutes(
          {
            organizationId: context.auth.organizationId,
            workspaceId: context.auth.workspaceId,
            apiKeyId: context.auth.apiKeyId,
            environment: context.auth.environment,
            requestedModel: requestedModelId,
            canonicalModel: {
              id: model.id,
              canonicalId: model.canonicalId,
              family: model.family,
              category: model.category,
              inputModalities: model.inputModalities,
              outputModalities: model.outputModalities,
              contextWindow: model.contextWindow,
              maxOutputTokens: model.maxOutputTokens,
            },
          },
          candidates.map((c) => ({
            routeId: c.routeId,
            providerId: c.providerId,
            providerModelId: c.providerModelId,
            region: c.region,
            estimatedCost: calculateEstimatedCost(
              c,
              routingRequest.estimatedInputTokens,
              routingRequest.estimatedOutputTokens
            ),
          }))
        );

        for (const exc of policyBatchRes.excluded) {
          const code: ExclusionReasonCode =
            exc.denialCode === "PROVIDER_DENIED"
              ? "PROVIDER_DENIED"
              : exc.denialCode === "REGION_DENIED" || exc.denialCode === "DATA_RESIDENCY_DENIED"
              ? "REGION_DENIED"
              : exc.denialCode === "COST_POLICY_DENIED"
              ? "COST_LIMIT"
              : "PROVIDER_DENIED";
          policyExcludedMap.set(exc.candidate.routeId, { reason: exc.reason, code });
        }
      } catch {
        // Fail safe
      }
    }

    for (const candidate of candidates) {
      const estimatedCost = calculateEstimatedCost(
        candidate,
        routingRequest.estimatedInputTokens,
        routingRequest.estimatedOutputTokens
      );

      const policyExclusion = policyExcludedMap.get(candidate.routeId);

      const eligibility = policyExclusion
        ? { eligible: false, exclusionReason: policyExclusion.code }
        : evaluateEligibility(
            candidate,
            routingRequest,
            effectivePolicy,
            estimatedCost
          );

      if (eligibility.eligible) {
        eligibleCandidates.push(candidate);
        consideredRoutes.push({
          routeId: candidate.routeId,
          providerId: candidate.providerId,
          providerModelId: candidate.providerModelId,
          region: candidate.region,
          priority: candidate.priority,
          weight: candidate.weight,
          eligible: true,
          estimatedCost,
        });
      } else {
        consideredRoutes.push({
          routeId: candidate.routeId,
          providerId: candidate.providerId,
          providerModelId: candidate.providerModelId,
          region: candidate.region,
          priority: candidate.priority,
          weight: candidate.weight,
          eligible: false,
          exclusionReason: eligibility.exclusionReason,
          estimatedCost,
        });
      }
    }

    // 6. Handle No Eligible Routes (Fail Closed)
    if (eligibleCandidates.length === 0) {
      const reasons = consideredRoutes
        .filter((r) => r.exclusionReason)
        .map((r) => `${r.providerId}:${r.exclusionReason}`);

      throw new GrowXProviderError(
        "model_unavailable",
        `No eligible provider routes available for model '${model.canonicalId}' matching requested capabilities [${context.requiredCapabilities.join(", ")}]. Exclusions: [${reasons.join(", ")}]`,
        false,
        503
      );
    }

    // 7. Strategy Ranking
    const strategy = effectivePolicy.strategy || "priority";
    const ranked: RankedCandidate[] = rankCandidates(
      strategy,
      eligibleCandidates,
      routingRequest,
      effectivePolicy,
      { stableKey: routingRequest.stableKey }
    );

    const primaryRanked = ranked[0]!;
    const primaryCandidate = primaryRanked.candidate;

    // Find the original ProviderRouteEntity
    const selectedRoute = (eligibleConfiguredRoutes as ProviderRouteEntity[]).find(
      (r) => r.id === primaryCandidate.routeId
    )!;

    // Annotate considered routes with score
    for (const r of ranked) {
      const considered = consideredRoutes.find(
        (c) => c.routeId === r.candidate.routeId
      );
      if (considered) {
        considered.score = r.score;
      }
    }

    // 8. Build Fallback Chain
    const fallbackChain: RouteTarget[] = ranked.slice(1).map((r) => ({
      routeId: r.candidate.routeId,
      providerId: r.candidate.providerId,
      providerModelId: r.candidate.providerModelId,
      publicModelId: r.candidate.publicModelId,
    }));

    const scoreBreakdown: RouteScore[] = consideredRoutes.map((cr) => {
      const matching = ranked.find((r) => r.candidate.routeId === cr.routeId);
      if (matching) {
        return matching.scores;
      }
      return {
        routeId: cr.routeId,
        providerId: cr.providerId,
        providerModelId: cr.providerModelId,
        costScore: 0,
        latencyScore: 0,
        priorityScore: 0,
        finalScore: 0,
        eligible: false,
        rejectionReason: cr.exclusionReason,
      };
    });

    // 9. Construct Decision Object
    const decision: RoutingDecision = {
      id: this.idGenerator(),
      requestId: context.requestId,
      strategy,
      canonicalModelId: model.canonicalId,
      selectedRouteId: selectedRoute.id,
      selectedProviderId: selectedRoute.providerId,
      selectedProviderModelId: selectedRoute.providerModelId,
      candidateCount: candidates.length,
      eligibleCandidateCount: eligibleCandidates.length,
      consideredRoutes,
      reasons: primaryRanked.reasons,
      score: primaryRanked.score,
      fallbackChain,
      scoreBreakdown,
      decisionAt: new Date(),
      policyId: effectivePolicy.id,
      policyVersion: effectivePolicy.version,
    };

    // 10. Persist Decision
    await this.repository.saveDecision(decision).catch(() => {
      // Non-blocking persistence failure
    });

    const resolvedRoute: ResolvedGatewayRoute = {
      canonicalModel: model,
      route: selectedRoute,
      activeAlias,
      requestedModelId,
      canonicalModelId: model.canonicalId,
      requiredCapabilities: context.requiredCapabilities,
      routingDecision: decision,
    };

    return {
      decision,
      selectedRoute,
      canonicalModel: model,
      resolvedRoute,
    };
  }

  /**
   * Resolve the effective routing policy considering hierarchy:
   * Global -> Organization -> Workspace -> Constraints.
   */
  async resolveEffectivePolicy(
    organizationId?: string | undefined,
    workspaceId?: string | undefined,
    constraints?: any
  ): Promise<RoutingPolicy> {
    const [globalPolicy, orgPolicy, wsPolicy] = await Promise.all([
      this.repository.getGlobalPolicy(),
      organizationId ? this.repository.getPolicy(organizationId, null) : null,
      organizationId && workspaceId ? this.repository.getPolicy(organizationId, workspaceId) : null,
    ]);

    return mergeRoutingPolicies(
      [globalPolicy, orgPolicy, wsPolicy],
      constraints
    );
  }

  /**
   * Simulate routing without making external calls or mutating state.
   */
  async simulate(context: RoutingEngineContext): Promise<RoutingDecision> {
    const result = await this.route(context);
    return result.decision;
  }
}
