import { createHash } from "node:crypto";
import {
  calculateEstimatedCost,
  generateExplanations,
  normalizeWeights,
  scoreCandidate,
} from "./scoring.js";
import type {
  RankedCandidate,
  RouteCandidate,
  RoutingPolicy,
  RoutingRequest,
  RoutingStrategy,
} from "./types.js";

export interface StrategyEvaluationOptions {
  rng?: (() => number) | undefined;
  stableKey?: string | undefined;
}

/** Stable deterministic hash for sticky weighted routing */
export function stableBucket(key: string): number {
  return (
    createHash("sha256").update(key).digest().readUInt32BE(0) / 0x1_0000_0000
  );
}

/**
 * Priority Strategy: Sort by priority ascending (lower integer = higher priority).
 * Stable tie-breaker: routeId lexical ascending.
 */
export function evaluatePriorityStrategy(
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined
): RankedCandidate[] {
  const costs = eligibleCandidates.map((c) =>
    calculateEstimatedCost(c, request.estimatedInputTokens, request.estimatedOutputTokens)
  );
  const definedCosts = costs.filter((c): c is number => c !== undefined);
  const maxCost = definedCosts.length > 0 ? Math.max(0.0001, ...definedCosts) : 0.0001;
  const maxLatency = Math.max(
    1,
    ...eligibleCandidates.map((c) => c.latencySignal?.p95LatencyMs ?? c.p95LatencyMs ?? 50)
  );
  const weights = normalizeWeights(policy?.weights);

  const scored = eligibleCandidates.map((candidate, i) => {
    const cost = costs[i]!;
    const score = scoreCandidate(
      candidate,
      maxCost,
      maxLatency,
      weights,
      "priority",
      cost
    );
    return {
      candidate,
      score: score.finalScore,
      scores: score,
      reasons: generateExplanations(candidate, score, "priority", policy),
    };
  });

  return scored.sort((a, b) => {
    if (a.candidate.priority !== b.candidate.priority) {
      return a.candidate.priority - b.candidate.priority;
    }
    return a.candidate.routeId.localeCompare(b.candidate.routeId);
  });
}

/**
 * Weighted Strategy: Select proportionally by candidate weights.
 * Supports sticky hashing when stableKey is provided or policy is sticky.
 */
export function evaluateWeightedStrategy(
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined,
  options?: StrategyEvaluationOptions | undefined
): RankedCandidate[] {
  const costs = eligibleCandidates.map((c) =>
    calculateEstimatedCost(c, request.estimatedInputTokens, request.estimatedOutputTokens)
  );
  const definedCosts = costs.filter((c): c is number => c !== undefined);
  const maxCost = definedCosts.length > 0 ? Math.max(0.0001, ...definedCosts) : 0.0001;
  const maxLatency = Math.max(
    1,
    ...eligibleCandidates.map((c) => c.latencySignal?.p95LatencyMs ?? c.p95LatencyMs ?? 50)
  );
  const weights = normalizeWeights(policy?.weights);

  // Apply any policy provider weight overrides
  const effectiveCandidates = eligibleCandidates.map((c) => {
    const override = policy?.providerWeights?.[c.providerId];
    return override !== undefined ? { ...c, weight: override } : c;
  });

  const totalWeight = effectiveCandidates.reduce(
    (sum, c) => sum + Math.max(0, c.weight || 1),
    0
  );

  const scored = effectiveCandidates.map((candidate, i) => {
    const cost = costs[i]!;
    const score = scoreCandidate(
      candidate,
      maxCost,
      maxLatency,
      weights,
      "weighted",
      cost
    );
    return {
      candidate,
      score: score.finalScore,
      scores: score,
      reasons: generateExplanations(candidate, score, "weighted", policy),
    };
  });

  if (totalWeight <= 0 || effectiveCandidates.length === 1) {
    return scored;
  }

  // Determine random cursor position (0..1)
  const isSticky = policy?.sticky || options?.stableKey || request.stableKey;
  const stableKey =
    options?.stableKey ??
    request.stableKey ??
    request.workspaceId ??
    request.apiKeyId ??
    request.requestId;

  const randomVal =
    isSticky && stableKey
      ? stableBucket(stableKey)
      : (options?.rng ? options.rng() : Math.random());

  let cursor = randomVal * totalWeight;
  let selectedIndex = effectiveCandidates.length - 1;

  for (let i = 0; i < effectiveCandidates.length; i++) {
    const w = Math.max(0, effectiveCandidates[i]!.weight || 1);
    cursor -= w;
    if (cursor < 0) {
      selectedIndex = i;
      break;
    }
  }

  // Put selected candidate first, remaining sorted by weight descending
  const selected = scored[selectedIndex]!;
  const rest = scored
    .filter((_, idx) => idx !== selectedIndex)
    .sort((a, b) => b.candidate.weight - a.candidate.weight);

  return [selected, ...rest];
}

/**
 * Lowest Cost Strategy: Sort by estimated provider cost ascending.
 * Routes with unknown pricing are placed last.
 */
export function evaluateLowestCostStrategy(
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined
): RankedCandidate[] {
  const costs = eligibleCandidates.map((c) =>
    calculateEstimatedCost(c, request.estimatedInputTokens, request.estimatedOutputTokens)
  );
  const definedCosts = costs.filter((c): c is number => c !== undefined);
  const maxCost = definedCosts.length > 0 ? Math.max(0.0001, ...definedCosts) : 0.0001;
  const maxLatency = Math.max(
    1,
    ...eligibleCandidates.map((c) => c.latencySignal?.p95LatencyMs ?? c.p95LatencyMs ?? 50)
  );
  const weights = normalizeWeights(policy?.weights);

  const scored = eligibleCandidates.map((candidate, i) => {
    const cost = costs[i]!;
    const score = scoreCandidate(
      candidate,
      maxCost,
      maxLatency,
      weights,
      "lowest_cost",
      cost
    );
    return {
      candidate,
      score: score.finalScore,
      scores: score,
      reasons: generateExplanations(candidate, score, "lowest_cost", policy),
    };
  });

  return scored.sort((a, b) => {
    // Highest costScore = lowest cost
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie breaker: priority, then routeId lexical
    if (a.candidate.priority !== b.candidate.priority) {
      return a.candidate.priority - b.candidate.priority;
    }
    return a.candidate.routeId.localeCompare(b.candidate.routeId);
  });
}

/**
 * Lowest Latency Strategy: Sort by latency signal ascending.
 * Missing latency history uses neutral fallback.
 */
export function evaluateLowestLatencyStrategy(
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined
): RankedCandidate[] {
  const costs = eligibleCandidates.map((c) =>
    calculateEstimatedCost(c, request.estimatedInputTokens, request.estimatedOutputTokens)
  );
  const definedCosts = costs.filter((c): c is number => c !== undefined);
  const maxCost = definedCosts.length > 0 ? Math.max(0.0001, ...definedCosts) : 0.0001;
  const maxLatency = Math.max(
    1,
    ...eligibleCandidates.map((c) => c.latencySignal?.p95LatencyMs ?? c.p95LatencyMs ?? 50)
  );
  const weights = normalizeWeights(policy?.weights);

  const scored = eligibleCandidates.map((candidate, i) => {
    const cost = costs[i]!;
    const score = scoreCandidate(
      candidate,
      maxCost,
      maxLatency,
      weights,
      "lowest_latency",
      cost
    );
    return {
      candidate,
      score: score.finalScore,
      scores: score,
      reasons: generateExplanations(candidate, score, "lowest_latency", policy),
    };
  });

  return scored.sort((a, b) => {
    // Highest latencyScore = lowest latency
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie breaker: priority, then routeId lexical
    if (a.candidate.priority !== b.candidate.priority) {
      return a.candidate.priority - b.candidate.priority;
    }
    return a.candidate.routeId.localeCompare(b.candidate.routeId);
  });
}

/**
 * Balanced Strategy: Multi-factor score combining cost, latency, availability, priority.
 */
export function evaluateBalancedStrategy(
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined
): RankedCandidate[] {
  const costs = eligibleCandidates.map((c) =>
    calculateEstimatedCost(c, request.estimatedInputTokens, request.estimatedOutputTokens)
  );
  const definedCosts = costs.filter((c): c is number => c !== undefined);
  const maxCost = definedCosts.length > 0 ? Math.max(0.0001, ...definedCosts) : 0.0001;
  const maxLatency = Math.max(
    1,
    ...eligibleCandidates.map((c) => c.latencySignal?.p95LatencyMs ?? c.p95LatencyMs ?? 50)
  );
  const weights = normalizeWeights(policy?.weights);

  const scored = eligibleCandidates.map((candidate, i) => {
    const cost = costs[i]!;
    const score = scoreCandidate(
      candidate,
      maxCost,
      maxLatency,
      weights,
      "balanced",
      cost
    );
    return {
      candidate,
      score: score.finalScore,
      scores: score,
      reasons: generateExplanations(candidate, score, "balanced", policy),
    };
  });

  return scored.sort((a, b) => {
    // Highest composite score first
    if (Math.abs(b.score - a.score) > 0.0001) {
      return b.score - a.score;
    }
    // Tie breaker: priority, then routeId lexical
    if (a.candidate.priority !== b.candidate.priority) {
      return a.candidate.priority - b.candidate.priority;
    }
    return a.candidate.routeId.localeCompare(b.candidate.routeId);
  });
}

/**
 * Dispatch evaluation to strategy implementation.
 */
export function rankCandidates(
  strategy: RoutingStrategy,
  eligibleCandidates: RouteCandidate[],
  request: RoutingRequest,
  policy?: RoutingPolicy | undefined,
  options?: StrategyEvaluationOptions | undefined
): RankedCandidate[] {
  if (eligibleCandidates.length === 0) {
    return [];
  }

  switch (strategy) {
    case "priority":
      return evaluatePriorityStrategy(eligibleCandidates, request, policy);
    case "weighted":
      return evaluateWeightedStrategy(eligibleCandidates, request, policy, options);
    case "lowest_cost":
      return evaluateLowestCostStrategy(eligibleCandidates, request, policy);
    case "lowest_latency":
      return evaluateLowestLatencyStrategy(eligibleCandidates, request, policy);
    case "balanced":
    default:
      return evaluateBalancedStrategy(eligibleCandidates, request, policy);
  }
}
