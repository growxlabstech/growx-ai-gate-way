import crypto from "node:crypto";
import type {
  RequestCapabilityProfile,
  RoutingObjective,
  RoutingPolicyWeights,
  RankedCandidateRecord,
  RouteScoreDetails,
} from "@growx/contracts";
import type { RouteCandidate } from "./types.js";
import { LatencyScorer } from "./scorers/latency-scorer.js";
import { CostScorer } from "./scorers/cost-scorer.js";
import { ReliabilityScorer } from "./scorers/reliability-scorer.js";
import { CapacityScorer } from "./scorers/capacity-scorer.js";
import { LocalityScorer } from "./scorers/locality-scorer.js";

export interface CandidateRankingOptions {
  objective?: RoutingObjective | undefined;
  weights?: RoutingPolicyWeights | undefined;
  explorationRate?: number | undefined;
  currentActiveRouteId?: string | undefined;
  hysteresisPenalty?: number | undefined;
}

export class DeterministicCandidateRanker {
  public static rank(
    candidates: RouteCandidate[],
    profile: RequestCapabilityProfile,
    options: CandidateRankingOptions = {},
  ): { ranked: RankedCandidateRecord[]; topChoice: RankedCandidateRecord } {
    if (candidates.length === 0) {
      throw new Error("Cannot rank empty candidate list");
    }

    const objective = options.objective || "balanced";
    const weights = this.resolveWeights(objective, options.weights);

    // Compute scores for each candidate
    const scoredCandidates: {
      candidate: RouteCandidate;
      score: RouteScoreDetails;
      rawTotal: number;
    }[] = [];

    for (const cand of candidates) {
      const latRes = LatencyScorer.score(cand, profile.streaming);
      const costRes = CostScorer.score(cand, candidates);
      const relRes = ReliabilityScorer.score(cand);
      const capRes = CapacityScorer.score(cand);
      const locRes = LocalityScorer.score(cand, profile);

      let policyAdjustment = 0;
      const reasons: string[] = [];

      // Customer provider preference bonus
      if (
        profile.providerPreference &&
        profile.providerPreference === cand.providerId
      ) {
        policyAdjustment += 15;
        reasons.push("PREFERRED_PROVIDER_BONUS");
      }

      // Hysteresis stability penalty to prevent route flapping
      if (
        options.currentActiveRouteId &&
        cand.routeId !== options.currentActiveRouteId
      ) {
        const pen = options.hysteresisPenalty ?? 2;
        policyAdjustment -= pen;
        reasons.push("HYSTERESIS_STABILITY_FACTOR");
      }

      // Priority bias (only for balanced/pinned where explicit metric is not dominant)
      const priorityBonus =
        objective === "balanced" || objective === "pinned"
          ? Math.max(0, 5 - Math.min(5, cand.priority / 10))
          : 0;
      policyAdjustment += priorityBonus;

      const weightedScore =
        latRes.score * weights.latency +
        costRes.score * weights.cost +
        relRes.score * weights.reliability +
        capRes.score * weights.capacity +
        locRes.score * weights.locality +
        policyAdjustment;

      const totalScore =
        Math.round(Math.max(0, Math.min(100, weightedScore)) * 100) / 100;

      const scoreDetails: RouteScoreDetails = {
        candidateId: cand.routeId,
        routeId: cand.routeId,
        providerId: cand.providerId,
        totalScore,
        latencyScore: latRes.score,
        costScore: costRes.score,
        reliabilityScore: relRes.score,
        capacityScore: capRes.score,
        localityScore: locRes.score,
        policyAdjustment,
        reasons,
      };

      scoredCandidates.push({
        candidate: cand,
        score: scoreDetails,
        rawTotal: totalScore,
      });
    }

    // Deterministic Sorting:
    // 1. Total score descending
    // 2. Priority ascending (lower priority int = higher priority)
    // 3. Stable tie-break by MD5 hash of routeId
    scoredCandidates.sort((a, b) => {
      if (Math.abs(b.rawTotal - a.rawTotal) > 0.001) {
        return b.rawTotal - a.rawTotal;
      }
      if (a.candidate.priority !== b.candidate.priority) {
        return a.candidate.priority - b.candidate.priority;
      }
      const hashA = crypto
        .createHash("md5")
        .update(a.candidate.routeId)
        .digest("hex");
      const hashB = crypto
        .createHash("md5")
        .update(b.candidate.routeId)
        .digest("hex");
      return hashA.localeCompare(hashB);
    });

    // Map to RankedCandidateRecord
    const ranked: RankedCandidateRecord[] = scoredCandidates.map((sc, idx) => ({
      routeId: sc.candidate.routeId,
      providerId: sc.candidate.providerId,
      providerModelId: sc.candidate.providerModelId,
      region: sc.candidate.region || "global",
      rank: idx + 1,
      eligible: true,
      score: sc.score,
      estimatedCostMinor:
        sc.candidate.estimatedCost ??
        (sc.candidate.priceInputPerMillionMinor !== undefined
          ? Number(sc.candidate.priceInputPerMillionMinor)
          : undefined),
      estimatedLatencyMs: sc.candidate.p95LatencyMs,
      failureDomain: {
        routeId: sc.candidate.routeId,
        providerId: sc.candidate.providerId,
        region: sc.candidate.region || "global",
      },
    }));

    return {
      ranked,
      topChoice: ranked[0]!,
    };
  }

  private static resolveWeights(
    objective: RoutingObjective,
    customWeights?: RoutingPolicyWeights,
  ): RoutingPolicyWeights {
    if (objective === "custom_policy" && customWeights) {
      return customWeights;
    }

    switch (objective) {
      case "lowest_latency":
        return {
          latency: 0.8,
          cost: 0.05,
          reliability: 0.1,
          capacity: 0.025,
          locality: 0.025,
        };
      case "lowest_cost":
        return {
          latency: 0.05,
          cost: 0.8,
          reliability: 0.1,
          capacity: 0.025,
          locality: 0.025,
        };
      case "highest_reliability":
        return {
          latency: 0.05,
          cost: 0.05,
          reliability: 0.85,
          capacity: 0.025,
          locality: 0.025,
        };
      case "highest_throughput":
        return {
          latency: 0.05,
          cost: 0.35,
          reliability: 0.2,
          capacity: 0.35,
          locality: 0.05,
        };
      case "pinned":
        return {
          latency: 0.2,
          cost: 0.2,
          reliability: 0.4,
          capacity: 0.1,
          locality: 0.1,
        };
      case "balanced":
      default:
        return {
          latency: 0.3,
          cost: 0.25,
          reliability: 0.25,
          capacity: 0.1,
          locality: 0.1,
        };
    }
  }
}
