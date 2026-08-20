import { createPublicId } from "@growx/ids";
import type { AnalyticsRepository } from "./repository.js";
import type { AnomalySignal } from "./types.js";

export interface AnomalyThresholds {
  errorRateThreshold: number; // e.g. 0.15 (15%)
  latencyP95Multiplier: number; // e.g. 2.5x baseline
  fallbackRateThreshold: number; // e.g. 0.20 (20%)
}

export class OperationalSignalService {
  private thresholds: AnomalyThresholds;

  constructor(
    private readonly repository: AnalyticsRepository,
    thresholds?: Partial<AnomalyThresholds>
  ) {
    this.thresholds = {
      errorRateThreshold: 0.15,
      latencyP95Multiplier: 2.5,
      fallbackRateThreshold: 0.20,
      ...thresholds,
    };
  }

  public async evaluateOperationalHealth(params: {
    organizationId?: string;
    providerId?: string;
    now?: Date;
  }): Promise<AnomalySignal[]> {
    const now = params.now ?? new Date();
    const currentWindowStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 min
    const baselineStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour baseline

    const currentRollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      providerId: params.providerId,
      startTime: currentWindowStart,
      endTime: now,
      granularity: "hour",
    });

    let currentReqs = 0;
    let currentFails = 0;
    let currentFallbacks = 0;

    for (const r of currentRollups) {
      currentReqs += r.requestsTotal;
      currentFails += r.requestsFailed;
      currentFallbacks += r.fallbackAttempts;
    }

    const detected: AnomalySignal[] = [];

    // 1. Error Rate Spike Detection
    if (currentReqs >= 5) {
      const errorRate = currentFails / currentReqs;
      if (errorRate >= this.thresholds.errorRateThreshold) {
        const signal: AnomalySignal = {
          id: createPublicId("anlsig"),
          anomalyType: "PROVIDER_ERROR_SPIKE",
          severity: errorRate >= 0.5 ? "critical" : "warning",
          organizationId: params.organizationId,
          providerId: params.providerId,
          observedValue: Math.round(errorRate * 100) / 100,
          baselineValue: 0.02,
          threshold: this.thresholds.errorRateThreshold,
          details: {
            currentRequests: currentReqs,
            failedRequests: currentFails,
            message: `Observed error rate ${Math.round(errorRate * 100)}% exceeded threshold ${Math.round(this.thresholds.errorRateThreshold * 100)}%`,
          },
          detectedAt: now,
        };
        await this.repository.saveAnomaly(signal);
        detected.push(signal);
      }
    }

    // 2. Fallback Rate Spike Detection
    if (currentReqs >= 5) {
      const fallbackRate = currentFallbacks / currentReqs;
      if (fallbackRate >= this.thresholds.fallbackRateThreshold) {
        const signal: AnomalySignal = {
          id: createPublicId("anlsig"),
          anomalyType: "FALLBACK_SPIKE",
          severity: "warning",
          organizationId: params.organizationId,
          providerId: params.providerId,
          observedValue: Math.round(fallbackRate * 100) / 100,
          baselineValue: 0.01,
          threshold: this.thresholds.fallbackRateThreshold,
          details: {
            currentRequests: currentReqs,
            fallbackAttempts: currentFallbacks,
            message: `Observed fallback rate ${Math.round(fallbackRate * 100)}% exceeded threshold ${Math.round(this.thresholds.fallbackRateThreshold * 100)}%`,
          },
          detectedAt: now,
        };
        await this.repository.saveAnomaly(signal);
        detected.push(signal);
      }
    }

    return detected;
  }
}
