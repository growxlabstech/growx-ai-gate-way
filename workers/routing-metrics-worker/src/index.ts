import { healthScore } from "@growx/routing";
export interface ProviderWindow {
  providerId: string;
  successRate: number;
  timeoutRate: number;
  serverErrorRate: number;
  rateLimitRate: number;
  streamFailureRate: number;
  latencyScore: number;
  capacityScore: number;
}
export interface ScoreSink {
  save(
    providerId: string,
    score: number,
    status: "healthy" | "degraded" | "high_risk" | "unhealthy",
  ): Promise<void>;
}
export async function calculateRoutingHealth(
  windows: readonly ProviderWindow[],
  sink: ScoreSink,
) {
  for (const value of windows) {
    const score = healthScore(value);
    const status =
      score >= 90
        ? "healthy"
        : score >= 70
          ? "degraded"
          : score >= 40
            ? "high_risk"
            : "unhealthy";
    await sink.save(value.providerId, score, status);
  }
}
