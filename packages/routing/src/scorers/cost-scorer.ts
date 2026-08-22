import type { RouteCandidate } from "../types.js";

export class CostScorer {
  /**
   * Computes a normalized cost score (0 - 100).
   * Lower estimated cost yields a higher score.
   */
  public static score(
    candidate: RouteCandidate,
    allCandidates: RouteCandidate[],
  ): { score: number; estimatedCostMinor: number } {
    const cost =
      candidate.estimatedCost ??
      (candidate.priceInputPerMillionMinor !== undefined
        ? Number(candidate.priceInputPerMillionMinor)
        : 1000);

    // Relative cost normalization against candidate pool
    const allCosts = allCandidates
      .map(
        (c) =>
          c.estimatedCost ??
          (c.priceInputPerMillionMinor !== undefined
            ? Number(c.priceInputPerMillionMinor)
            : 1000),
      )
      .filter((c) => c > 0);

    const minCost = Math.min(...allCosts, cost);
    const maxCost = Math.max(...allCosts, cost);

    if (maxCost === minCost) {
      return { score: 85, estimatedCostMinor: cost };
    }

    // Min cost gets 100, Max cost gets 30
    const ratio = (cost - minCost) / (maxCost - minCost);
    const score = 100 - ratio * 70;

    return {
      score: Math.round(Math.max(5, Math.min(100, score)) * 10) / 10,
      estimatedCostMinor: cost,
    };
  }
}
