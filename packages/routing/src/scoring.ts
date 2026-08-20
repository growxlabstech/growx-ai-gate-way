import type {
  RouteCandidate,
  RouteScore,
  RoutingPolicy,
  RoutingRequest,
  ScoreWeights,
} from "./types.js";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  cost: 0.35,
  latency: 0.35,
  availability: 0.2,
  priority: 0.1,
};

export const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function healthScore(input: {
  successRate: number;
  timeoutRate: number;
  serverErrorRate: number;
  rateLimitRate: number;
  streamFailureRate: number;
  latencyScore: number;
  capacityScore: number;
}): number {
  return Math.round(
    100 *
      clamp(
        input.successRate * 0.45 +
          (1 - input.timeoutRate) * 0.15 +
          (1 - input.serverErrorRate) * 0.1 +
          (1 - input.rateLimitRate) * 0.05 +
          (1 - input.streamFailureRate) * 0.05 +
          input.latencyScore * 0.1 +
          input.capacityScore * 0.1
      )
  );
}

export function validateWeights(weights: ScoreWeights): void {
  const values = [weights.cost, weights.latency, weights.availability, weights.priority];
  if (values.some((v) => v < 0 || v > 1 || isNaN(v))) {
    throw new Error("Routing score weights must be non-negative numbers between 0 and 1");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    throw new Error("Routing score weights cannot all be zero");
  }
}

export function normalizeWeights(weights?: Partial<ScoreWeights> | undefined): ScoreWeights {
  const merged: ScoreWeights = {
    cost: weights?.cost ?? DEFAULT_WEIGHTS.cost,
    latency: weights?.latency ?? DEFAULT_WEIGHTS.latency,
    availability: weights?.availability ?? weights?.reliability ?? DEFAULT_WEIGHTS.availability,
    priority: weights?.priority ?? DEFAULT_WEIGHTS.priority,
  };
  validateWeights(merged);
  const sum = merged.cost + merged.latency + merged.availability + merged.priority;
  return {
    cost: merged.cost / sum,
    latency: merged.latency / sum,
    availability: merged.availability / sum,
    priority: merged.priority / sum,
  };
}

import type { ProviderCostEstimator } from "@growx/pricing";

/**
 * Estimate the provider cost in dollars for a request.
 * Returns undefined if pricing metadata is unknown.
 */
export function calculateEstimatedCost(
  candidate: RouteCandidate,
  estimatedInputTokens = 1000,
  estimatedOutputTokens = 500,
  estimator?: ProviderCostEstimator | undefined
): number | undefined {
  if (estimator) {
    const estimated = estimator.estimateRouteCost(candidate, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
    });
    if (estimated !== undefined) {
      return estimated.toNumber();
    }
  }
  if (candidate.estimatedCost !== undefined) {
    return candidate.estimatedCost;
  }
  if (candidate.pricing) {
    const inputCost =
      (candidate.pricing.inputPricePerMillionMinor / 100) *
      (estimatedInputTokens / 1_000_000);
    const outputCost =
      (candidate.pricing.outputPricePerMillionMinor / 100) *
      (estimatedOutputTokens / 1_000_000);
    return Math.max(0, inputCost + outputCost);
  }
  if (
    candidate.priceInputPerMillionMinor !== undefined &&
    candidate.priceOutputPerMillionMinor !== undefined
  ) {
    const inPrice = Number(candidate.priceInputPerMillionMinor);
    const outPrice = Number(candidate.priceOutputPerMillionMinor);
    const inCost = (inPrice / 100) * (estimatedInputTokens / 1_000_000);
    const outCost = (outPrice / 100) * (estimatedOutputTokens / 1_000_000);
    return Math.max(0, inCost + outCost);
  }
  return undefined;
}

/**
 * Computes individual normalized scores and final composite score for a candidate.
 * Higher score is always better (scale 0.0 - 1.0).
 */
export function scoreCandidate(
  candidate: RouteCandidate,
  maxCost: number,
  maxLatency: number,
  weights: ScoreWeights,
  strategy: string,
  estimatedCost?: number | undefined
): RouteScore {
  const hasPricing = estimatedCost !== undefined;

  // 1. Cost Score: lower cost = higher score (0..1)
  // If pricing unknown:
  // - In lowest_cost strategy: 0.0 (placed last / lowest score)
  // - In balanced strategy: 0.5 (neutral score)
  let costScore = 0.5;
  if (hasPricing) {
    costScore = maxCost > 0 ? clamp(1 - estimatedCost / maxCost) : 1.0;
  } else if (strategy === "lowest_cost") {
    costScore = 0.0;
  }

  // 2. Latency Score: lower latency = higher score
  const latencyMs =
    candidate.latencySignal?.p95LatencyMs ??
    candidate.p95LatencyMs ??
    50;
  const latencyScore =
    maxLatency > 0 ? clamp(1 - latencyMs / maxLatency) : 0.5;

  // 3. Availability / Reliability Score
  const availabilityScore = clamp(
    candidate.availabilitySignal?.successRate ??
    candidate.reliability ??
    1.0
  );

  // 4. Capacity Score
  const capacityScore = clamp(
    1 - (candidate.capacitySignal?.utilization ?? candidate.capacityUtilization ?? 0)
  );

  // 5. Priority Score: lower priority number = higher score
  // E.g. priority 1 -> 1.0, priority 10 -> 0.1, priority 100 -> 0.01
  const priorityScore = clamp(1 / Math.max(1, candidate.priority));

  // Compute composite score based on active strategy
  let finalScore = 0;
  if (strategy === "lowest_cost") {
    finalScore = costScore;
  } else if (strategy === "lowest_latency") {
    finalScore = latencyScore;
  } else if (strategy === "highest_reliability") {
    finalScore = availabilityScore;
  } else if (strategy === "priority") {
    finalScore = priorityScore;
  } else {
    // "balanced" or default multi-factor
    finalScore = clamp(
      weights.cost * costScore +
      weights.latency * latencyScore +
      weights.availability * availabilityScore +
      weights.priority * priorityScore +
      (weights.capacity ?? 0) * capacityScore
    );
  }

  return {
    routeId: candidate.routeId,
    providerId: candidate.providerId,
    providerModelId: candidate.providerModelId,
    costScore,
    latencyScore,
    availabilityScore,
    reliabilityScore: availabilityScore,
    capacityScore,
    priorityScore,
    preferenceScore: priorityScore,
    finalScore,
    eligible: true,
    estimatedCostMinor: hasPricing ? BigInt(Math.floor(estimatedCost * 100)) : undefined,
  };
}

/**
 * Generate deterministic structured explanation reasons for a chosen route candidate.
 */
export function generateExplanations(
  candidate: RouteCandidate,
  score: RouteScore,
  strategy: string,
  policy?: RoutingPolicy | undefined
): string[] {
  const reasons: string[] = ["policy_allowed", "capabilities_matched"];

  if (candidate.region && candidate.region !== "global") {
    reasons.push(`region_matched (${candidate.region})`);
  }

  switch (strategy) {
    case "priority":
      reasons.push(`highest_priority (priority: ${candidate.priority})`);
      break;
    case "weighted":
      reasons.push(`weighted_selection (weight: ${candidate.weight})`);
      break;
    case "lowest_cost":
      reasons.push(`lowest_estimated_cost ($${(Number(score.estimatedCostMinor ?? 0) / 100).toFixed(6)})`);
      break;
    case "lowest_latency":
      reasons.push(
        `lowest_p95_latency (${candidate.latencySignal?.p95LatencyMs ?? candidate.p95LatencyMs ?? 50}ms)`
      );
      break;
    case "balanced":
      reasons.push(
        `highest_balanced_score (${score.finalScore.toFixed(3)})`,
        `cost_score: ${score.costScore.toFixed(2)}`,
        `latency_score: ${score.latencyScore.toFixed(2)}`,
        `availability_score: ${(score.availabilityScore ?? 1).toFixed(2)}`
      );
      break;
    default:
      reasons.push(`strategy_${strategy}`);
  }

  return reasons;
}
