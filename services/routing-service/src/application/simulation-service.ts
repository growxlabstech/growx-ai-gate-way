import type {
  RoutingSimulationRequest,
  RoutingSimulationResponse,
} from "@growx/contracts";
import type { RoutingEngineV2 } from "./routing-engine-v2.js";
import {
  HardConstraintFilter,
  DeterministicCandidateRanker,
  FallbackPlanBuilder,
} from "@growx/routing";

export class RoutingSimulationService {
  constructor(private readonly routerV2: RoutingEngineV2) {}

  public async simulate(
    request: RoutingSimulationRequest,
  ): Promise<RoutingSimulationResponse> {
    const {
      profile,
      objective = "balanced",
      customWeights,
      customConstraints,
    } = request;
    const snapshot = await this.routerV2.snapshotService.getSnapshot();

    const model = snapshot.models.get(profile.canonicalModelId);
    if (!model) {
      return {
        profile,
        objective,
        totalCandidatesConsidered: 0,
        eligibleCandidatesCount: 0,
        rejectedCandidatesCount: 0,
        selectedRouteId: null,
        selectedCandidate: null,
        rankedCandidates: [],
        fallbackChain: [],
        decisionReason: `Canonical model '${profile.canonicalModelId}' not found in registry`,
        simulatedAt: new Date(),
      };
    }

    const routes =
      snapshot.routes.get(model.canonicalId) ||
      snapshot.routes.get(model.id) ||
      [];
    const candidates = await this.routerV2.buildCandidateRecords(
      routes,
      model,
      snapshot,
      profile,
    );

    const filterOptions = {
      allowedProviders: customConstraints?.allowedProviders,
      deniedProviders: customConstraints?.deniedProviders,
      allowedRegions: customConstraints?.allowedRegions,
      dataResidency:
        customConstraints?.dataResidency || profile.dataResidencyRequirement,
      maxExecutionCostMinor:
        customConstraints?.maxExecutionCostMinor ||
        profile.maxExecutionCostMinor,
    };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      candidates,
      profile,
      filterOptions,
    );

    if (eligible.length === 0) {
      const topReason = rejected[0]?.rejectionReason || "NO_ELIGIBLE_ROUTE";
      return {
        profile,
        objective,
        totalCandidatesConsidered: candidates.length,
        eligibleCandidatesCount: 0,
        rejectedCandidatesCount: rejected.length,
        selectedRouteId: null,
        selectedCandidate: null,
        rankedCandidates: [],
        fallbackChain: [],
        decisionReason: `No candidates satisfied hard constraints: ${topReason}`,
        simulatedAt: new Date(),
      };
    }

    const { ranked, topChoice } = DeterministicCandidateRanker.rank(
      eligible,
      profile,
      {
        objective,
        weights: customWeights,
      },
    );

    const plan = FallbackPlanBuilder.buildPlan({
      rankedCandidates: ranked,
      policyVersion: 1,
      objective,
      requestProfileHash: "sim_hash",
    });

    return {
      profile,
      objective,
      totalCandidatesConsidered: candidates.length,
      eligibleCandidatesCount: eligible.length,
      rejectedCandidatesCount: rejected.length,
      selectedRouteId: topChoice.routeId,
      selectedCandidate: topChoice,
      rankedCandidates: ranked,
      fallbackChain: plan.fallbacks,
      decisionReason: `Simulated top route ${topChoice.routeId} (${topChoice.providerId}) with score ${topChoice.score?.totalScore ?? 100}`,
      simulatedAt: new Date(),
    };
  }
}
