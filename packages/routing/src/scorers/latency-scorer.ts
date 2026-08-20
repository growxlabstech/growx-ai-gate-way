import type { RouteCandidate } from "../types.js";

export class LatencyScorer {
  /**
   * Computes a normalized score (0 - 100) for candidate latency.
   * Lower latency yields a higher score.
   */
  public static score(
    candidate: RouteCandidate,
    isStreaming: boolean = false
  ): { score: number; details: { p95Ms: number; p50Ms: number; isCold: boolean } } {
    const latSignal = candidate.latencySignal;
    const p95 = latSignal?.p95LatencyMs ?? candidate.p95LatencyMs ?? 1500;
    const p50 = latSignal?.p50LatencyMs ?? Math.round(p95 * 0.6);
    const isCold = candidate.p95LatencyMs === undefined && (!latSignal || latSignal.source === "default");

    // For cold routes with no prior telemetry, assign a conservative neutral baseline
    if (isCold) {
      return { score: 70, details: { p95Ms: p95, p50Ms: p50, isCold: true } };
    }

    // For interactive streaming, prioritize faster responsive latencies
    const effectiveLatency = isStreaming ? p50 * 0.7 + p95 * 0.3 : p95;

    // Normalization curve: < 200ms -> 100, 1000ms -> 80, 3000ms -> 40, > 8000ms -> 5
    let score = 100 - (effectiveLatency / 3000) * 60;
    if (score < 5) score = 5;
    if (score > 100) score = 100;

    return {
      score: Math.round(score * 10) / 10,
      details: { p95Ms: p95, p50Ms: p50, isCold: false },
    };
  }
}
