import type { RouteCandidate } from "../types.js";

export class ReliabilityScorer {
  /**
   * Computes a reliability score (0 - 100) based on health, circuit state, and success rate.
   */
  public static score(candidate: RouteCandidate): {
    score: number;
    health: string;
  } {
    let score = 90;

    // Health factor
    const health = candidate.health || "healthy";
    if (health === "healthy") {
      score += 10;
    } else if (health === "degraded") {
      score -= 30;
    } else if (health === "unhealthy") {
      score -= 60;
    } else if (health === "unknown") {
      score -= 10;
    }

    // Circuit factor
    if (candidate.circuit === "HALF_OPEN") {
      score -= 40; // Penalty for half-open probe mode
    }

    // Telemetry success rate
    if (
      candidate.availabilitySignal &&
      typeof candidate.availabilitySignal.successRate === "number"
    ) {
      const sr = candidate.availabilitySignal.successRate; // 0..1
      score = score * 0.5 + sr * 100 * 0.5;
    }

    return {
      score: Math.round(Math.max(5, Math.min(100, score)) * 10) / 10,
      health,
    };
  }
}
