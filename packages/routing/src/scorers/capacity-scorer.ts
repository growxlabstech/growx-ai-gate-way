import type { RouteCandidate } from "../types.js";

export class CapacityScorer {
  /**
   * Computes capacity headroom score (0 - 100).
   */
  public static score(candidate: RouteCandidate): {
    score: number;
    utilization: number;
  } {
    const util =
      candidate.capacityUtilization ??
      candidate.capacitySignal?.utilization ??
      0.2;
    const state =
      candidate.capacityState ?? candidate.capacitySignal?.state ?? "available";

    let score = (1 - util) * 100;
    if (state === "busy") score -= 15;
    if (state === "near_limit") score -= 35;
    if (state === "exhausted") score = 0;

    return {
      score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10,
      utilization: util,
    };
  }
}
