import {
  GrowXProviderError,
  type RequestCapabilityProfile,
  type RoutingObjective,
  type RoutingPlan,
  type RoutingDecisionV2,
  type CanonicalCapability,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import type {
  CanonicalModelEntity,
  ModelRegistryService,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "@growx/model-registry-service";
import type { ProviderService } from "@growx/provider-service";
import {
  buildRequestCapabilityProfile,
  hashRequestCapabilityProfile,
  HardConstraintFilter,
  DeterministicCandidateRanker,
  FallbackPlanBuilder,
  TrafficControlEvaluator,
  type RouteCandidate,
  type IRouteHealthStore,
} from "@growx/routing";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { PolicyEngine } from "@growx/policy";
import type {
  IAvailabilitySignalProvider,
  ICapacitySignalProvider,
  ILatencySignalProvider,
} from "../domain/signals.js";
import {
  RoutingStateSnapshotService,
  type RoutingStateSnapshot,
} from "./routing-state-snapshot-service.js";

export type RouterExecutionMode = "v1_primary" | "v2_shadow" | "v2_canary" | "v2_primary";

export interface RouterV2Options {
  mode?: RouterExecutionMode | undefined;
  canaryTrafficPercent?: number | undefined;
  snapshotTtlMs?: number | undefined;
  routeHealthStore?: IRouteHealthStore | undefined;
  latencySignalProvider?: ILatencySignalProvider | undefined;
  capacitySignalProvider?: ICapacitySignalProvider | undefined;
  availabilitySignalProvider?: IAvailabilitySignalProvider | undefined;
  policyEngine?: PolicyEngine | undefined;
  costEstimator?: any | undefined;
  auditService?: any | undefined;
  notificationService?: any | undefined;
}

export interface RouterV2RequestContext {
  requestId: string;
  auth: MachineAuthContext;
  resolvedModel: ResolvedModelContext;
  requiredCapabilities: CanonicalCapability[];
  stream?: boolean | undefined;
  workloadType?: any | undefined;
  inputModalities?: any[] | undefined;
  outputModalities?: any[] | undefined;
  toolCalling?: boolean | undefined;
  structuredOutput?: boolean | undefined;
  reasoningMode?: boolean | undefined;
  contextTokensEstimated?: number | undefined;
  maxOutputTokens?: number | undefined;
  batch?: boolean | undefined;
  latencyClass?: any | undefined;
  regionRequirement?: string | undefined;
  dataResidencyRequirement?: string | undefined;
  providerPreference?: string | undefined;
  requiredProvider?: string | undefined;
  maxExecutionCostMinor?: number | undefined;
  objective?: RoutingObjective | undefined;
  customWeights?: any | undefined;
  constraints?: any | undefined;
  hints?: any | undefined;
}

export interface RouterV2ExecutionResult {
  decision: RoutingDecisionV2;
  plan: RoutingPlan;
  selectedRoute: ProviderRouteEntity;
  canonicalModel: CanonicalModelEntity;
  resolvedRoute: {
    canonicalModel: CanonicalModelEntity;
    route: ProviderRouteEntity;
    activeAlias?: any;
    requestedModelId: string;
    canonicalModelId: string;
    requiredCapabilities: CanonicalCapability[];
    routingDecision: RoutingDecisionV2;
    routingPlan: RoutingPlan;
  };
}

export class RoutingEngineV2 {
  public readonly snapshotService: RoutingStateSnapshotService;
  private mode: RouterExecutionMode;
  private canaryPercent: number;
  private readonly costEstimator?: any | undefined;
  private readonly healthStore?: IRouteHealthStore | undefined;
  private readonly latencyProvider?: ILatencySignalProvider | undefined;
  private readonly capacityProvider?: ICapacitySignalProvider | undefined;
  private readonly auditService?: any | undefined;
  private readonly notificationService?: any | undefined;

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerService: ProviderService,
    options: RouterV2Options = {}
  ) {
    this.mode = options.mode ?? "v2_primary";
    this.canaryPercent = options.canaryTrafficPercent ?? 100;
    this.costEstimator = options.costEstimator;
    this.healthStore = options.routeHealthStore;
    this.latencyProvider = options.latencySignalProvider;
    this.capacityProvider = options.capacitySignalProvider;
    this.auditService = options.auditService;
    this.notificationService = options.notificationService;

    this.snapshotService = new RoutingStateSnapshotService(modelRegistry, providerService, {
      ttlMs: options.snapshotTtlMs,
      routeHealthStore: options.routeHealthStore,
      latencySignalProvider: options.latencySignalProvider,
      capacitySignalProvider: options.capacitySignalProvider,
    });
  }

  public setMode(mode: RouterExecutionMode, canaryPercent: number = 100): void {
    this.mode = mode;
    this.canaryPercent = canaryPercent;
  }

  public getMode(): RouterExecutionMode {
    return this.mode;
  }

  public async route(context: RouterV2RequestContext): Promise<RouterV2ExecutionResult> {
    const { resolvedModel, requiredCapabilities } = context;
    const model = resolvedModel.model;

    // 1. Build RequestCapabilityProfile
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: model.canonicalId,
      workloadType: context.workloadType,
      streaming: context.stream,
      inputModalities: context.inputModalities || model.inputModalities,
      outputModalities: context.outputModalities || model.outputModalities,
      toolCalling: context.toolCalling ?? requiredCapabilities.includes("tools.call"),
      structuredOutput: context.structuredOutput ?? requiredCapabilities.includes("structured_output"),
      reasoningMode: context.reasoningMode ?? requiredCapabilities.includes("text.reason"),
      contextTokensEstimated: context.contextTokensEstimated,
      maxOutputTokens: context.maxOutputTokens,
      batch: context.batch,
      latencyClass: context.latencyClass,
      regionRequirement: context.regionRequirement,
      dataResidencyRequirement: context.dataResidencyRequirement,
      providerPreference: context.providerPreference,
      requiredProvider: context.requiredProvider,
      maxExecutionCostMinor: context.maxExecutionCostMinor,
    });

    const profileHash = hashRequestCapabilityProfile(profile);

    // 2. Obtain State Snapshot
    const snapshot = await this.snapshotService.getSnapshot();

    // 3. Discover Candidate Routes for Canonical Model
    const configuredRoutes =
      (resolvedModel.eligibleConfiguredRoutes as ProviderRouteEntity[]) ||
      snapshot.routes.get(model.canonicalId) ||
      [];

    const candidates = await this.buildCandidateRecords(configuredRoutes, model, snapshot, profile);

    // 4. Hard Constraint Filtering
    const filterOptions = {
      allowedProviders: context.constraints?.allowedProviders,
      deniedProviders: context.constraints?.deniedProviders,
      allowedRegions: context.constraints?.allowedRegions,
      dataResidency: profile.dataResidencyRequirement,
      maxExecutionCostMinor: profile.maxExecutionCostMinor,
    };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(candidates, profile, filterOptions);

    if (eligible.length === 0) {
      const topReason = rejected[0]?.rejectionReason || "NO_ELIGIBLE_ROUTE";
      throw new GrowXProviderError(
        "model_unavailable",
        `No eligible provider routes available for model '${model.canonicalId}' matching constraints [${topReason}]`,
        false,
        503
      );
    }

    // 5. Apply Route Traffic Controls (draining, disable, canary traffic percent)
    const controlledEligible = TrafficControlEvaluator.applyControls(
      eligible,
      snapshot.trafficControls,
      context.auth.organizationId
    );

    const poolToRank = controlledEligible.length > 0 ? controlledEligible : eligible;

    // 6. Deterministic Candidate Scoring and Ranking
    const objective = context.objective || "balanced";
    const { ranked, topChoice } = DeterministicCandidateRanker.rank(poolToRank, profile, {
      objective,
      weights: context.customWeights,
    });

    // 7. Build Fallback Plan
    const plan = FallbackPlanBuilder.buildPlan({
      rankedCandidates: ranked,
      policyVersion: 1,
      objective,
      requestProfileHash: profileHash,
    });

    const selectedRouteEntity = configuredRoutes.find(r => r.id === topChoice.routeId) || configuredRoutes[0]!;

    // 8. Build RoutingDecisionV2
    const decision: RoutingDecisionV2 = {
      id: generateId("dec"),
      requestId: context.requestId,
      routerVersion: "v2",
      policyVersion: 1,
      objective,
      requestProfileHash: profileHash,
      selectedRouteId: topChoice.routeId,
      selectedRank: topChoice.rank,
      candidateCount: poolToRank.length,
      decisionReason: `Selected route ${topChoice.routeId} (${topChoice.providerId}) with score ${topChoice.score?.totalScore ?? 100} under objective ${objective}`,
      topCandidates: ranked.slice(0, 5),
      createdAt: new Date(),
    };

    return {
      decision,
      plan,
      selectedRoute: selectedRouteEntity,
      canonicalModel: model,
      resolvedRoute: {
        canonicalModel: model,
        route: selectedRouteEntity,
        activeAlias: (resolvedModel as any).activeAlias,
        requestedModelId: resolvedModel.requestedModelId,
        canonicalModelId: resolvedModel.canonicalModelId,
        requiredCapabilities,
        routingDecision: decision,
        routingPlan: plan,
      },
    };
  }

  public async buildCandidateRecords(
    routes: ProviderRouteEntity[],
    model: CanonicalModelEntity,
    snapshot: RoutingStateSnapshot,
    profile: RequestCapabilityProfile
  ): Promise<RouteCandidate[]> {
    const routeIds = routes.map(r => r.id);
    const healthMap = this.healthStore
      ? await this.healthStore.getRouteHealthBatch(routeIds).catch(() => new Map())
      : new Map();

    return Promise.all(
      routes.map(async route => {
        const provider = snapshot.providers.get(route.providerId);
        const providerStatus = provider ? (provider.enabled ? provider.status : "disabled") : "active";

        const creds = snapshot.credentials.get(route.providerId) || [];
        const hasActiveCred = creds.length > 0 ? creds.some(c => c.status === "active") : true;

        const healthSnap = healthMap.get(route.id);
        const health = healthSnap?.health ?? "healthy";
        const circuit = healthSnap?.circuit ?? "CLOSED";

        // Latency
        let latencyMs = 800;
        if (this.latencyProvider) {
          const latSignal = await this.latencyProvider.getLatencySignal(route.providerId, route.providerModelId, route.region).catch(() => null);
          if (latSignal) latencyMs = latSignal.p95LatencyMs;
        }

        // Cost estimation
        let estimatedCost = 500;
        if (this.costEstimator) {
          try {
            estimatedCost = await this.costEstimator.estimateExecutionCost({
              routeId: route.id,
              providerId: route.providerId,
              modelId: model.id,
              inputTokens: profile.contextTokensEstimated || 1000,
              outputTokens: profile.maxOutputTokens || 500,
            });
          } catch {
            estimatedCost = 500;
          }
        }

        const candidateCaps = route.capabilitiesOverrides && route.capabilitiesOverrides.length > 0
          ? route.capabilitiesOverrides
          : model.capabilities;

        return {
          routeId: route.id,
          providerId: route.providerId,
          providerModelId: route.providerModelId,
          region: route.region || "global",
          priority: route.priority ?? 100,
          weight: 1,
          capabilities: candidateCaps as any,
          limits: {
            contextWindow: route.contextWindowOverride ?? model.contextWindow,
            maxOutputTokens: route.maxOutputTokensOverride ?? model.maxOutputTokens,
          },
          routeStatus: route.status,
          providerStatus,
          routingEligible: route.routingEligible,
          hasActiveCredential: hasActiveCred,
          health,
          circuit,
          p95LatencyMs: latencyMs,
          estimatedCost,
          capacityState: "available",
          capacityUtilization: 0.1,
        };
      })
    );
  }
}
