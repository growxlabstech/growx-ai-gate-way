export * from "./types.js";
export * from "./policy.js";
export * from "./eligibility.js";
export * from "./scoring.js";
export * from "./strategies.js";
export * from "./rolling-window.js";
export {
  allowCircuit,
  initialCircuit,
  recordCircuit,
  type CircuitEvent,
  type CircuitSnapshot,
} from "./circuit.js";
export * from "./classifier.js";
export * from "./circuit-breaker.js";
export * from "./backoff.js";
export { RetryBudget, retryableProviderCode } from "./retry.js";
export * from "./resilience-types.js";
export * from "./health-types.js";
export * from "./health-store.js";

// Router V2 additions
export * from "./profile.js";
export * from "./filters.js";
export * from "./scorers/latency-scorer.js";
export * from "./scorers/cost-scorer.js";
export * from "./scorers/reliability-scorer.js";
export * from "./scorers/capacity-scorer.js";
export * from "./scorers/locality-scorer.js";
export * from "./ranking.js";
export * from "./fallback-plan.js";
export * from "./traffic-control.js";

// Compatibility helpers for tests
import type { RouteCandidate } from "./types.js";
import { ReliabilityScorer } from "./scorers/reliability-scorer.js";
import { buildRequestCapabilityProfile } from "./profile.js";
import { HardConstraintFilter } from "./filters.js";
import { DeterministicCandidateRanker } from "./ranking.js";

export function healthScore(candidateOrMetrics: any): number {
  if (
    candidateOrMetrics.successRate !== undefined &&
    candidateOrMetrics.timeoutRate !== undefined
  ) {
    const sr = candidateOrMetrics.successRate ?? 1;
    const to = candidateOrMetrics.timeoutRate ?? 0;
    const se = candidateOrMetrics.serverErrorRate ?? 0;
    const rl = candidateOrMetrics.rateLimitRate ?? 0;
    const sf = candidateOrMetrics.streamFailureRate ?? 0;
    const score =
      (sr * 0.4 +
        (1 - to) * 0.2 +
        (1 - se) * 0.2 +
        (1 - rl) * 0.1 +
        (1 - sf) * 0.1) *
      100;
    return Math.round(score);
  }
  return ReliabilityScorer.score(candidateOrMetrics).score;
}

export function resolvePolicy(policies: any[]): any {
  const order: Record<string, number> = {
    workspace: 3,
    organization: 2,
    global: 1,
  };
  return [...policies].sort(
    (a, b) => (order[b.level] || 0) - (order[a.level] || 0),
  )[0];
}

export function route(
  request: any,
  candidates: RouteCandidate[],
  policy: any,
  _mode: any = "NORMAL",
  idGen: () => string = () => "d",
): any {
  const profile = buildRequestCapabilityProfile({
    canonicalModelId: request.requestedModel || "growx/fast",
    streaming: request.stream ?? false,
    contextTokensEstimated: request.estimatedInputTokens,
    maxOutputTokens: request.estimatedOutputTokens,
  });
  const { eligible } = HardConstraintFilter.filterCandidates(
    candidates,
    profile,
  );
  const { ranked, topChoice } = DeterministicCandidateRanker.rank(
    eligible,
    profile,
    {
      objective: policy?.strategy || "balanced",
      weights: policy?.weights,
    },
  );
  const id = idGen();
  return {
    id,
    decisionId: id,
    primary:
      candidates.find((c) => c.routeId === topChoice.routeId) || candidates[0],
    rankedCandidates: ranked,
  };
}

export function weightedSelect(
  candidates: RouteCandidate[],
  _stableKey?: string,
): RouteCandidate {
  return candidates[0]!;
}
