import type { HealthOutcomeSignal, RouteLatencyStats } from "./health-types.js";

export interface BucketCounts {
  timestamp: number; // bucket start ms
  successes: number;
  errors5xx: number;
  timeouts: number;
  networkErrors: number;
  rateLimits429: number;
  authFailures: number;
  latencies: number[];
}

export class SlidingWindowTracker {
  private buckets: BucketCounts[] = [];
  private readonly bucketDurationMs: number;
  private readonly totalWindowMs: number;

  constructor(windowMs = 60_000, bucketDurationMs = 5_000) {
    this.totalWindowMs = windowMs;
    this.bucketDurationMs = bucketDurationMs;
  }

  private prune(now: number) {
    const cutoff = now - this.totalWindowMs;
    this.buckets = this.buckets.filter((b) => b.timestamp >= cutoff);
  }

  private getOrCreateBucket(now: number): BucketCounts {
    this.prune(now);
    const bucketStart =
      Math.floor(now / this.bucketDurationMs) * this.bucketDurationMs;
    let bucket = this.buckets.find((b) => b.timestamp === bucketStart);
    if (!bucket) {
      bucket = {
        timestamp: bucketStart,
        successes: 0,
        errors5xx: 0,
        timeouts: 0,
        networkErrors: 0,
        rateLimits429: 0,
        authFailures: 0,
        latencies: [],
      };
      this.buckets.push(bucket);
    }
    return bucket;
  }

  recordSignal(
    signal: HealthOutcomeSignal,
    latencyMs?: number,
    now = Date.now(),
  ): void {
    const bucket = this.getOrCreateBucket(now);

    switch (signal) {
      case "success":
        bucket.successes++;
        break;
      case "error_5xx":
        bucket.errors5xx++;
        break;
      case "timeout":
        bucket.timeouts++;
        break;
      case "network_error":
        bucket.networkErrors++;
        break;
      case "rate_limit_429":
        bucket.rateLimits429++;
        break;
      case "auth_failure":
        bucket.authFailures++;
        break;
      case "client_cancelled":
      case "bad_request":
      case "content_rejected":
        // Deliberately excluded from provider infrastructure health metrics
        return;
    }

    if (latencyMs !== undefined && latencyMs >= 0) {
      bucket.latencies.push(latencyMs);
      if (bucket.latencies.length > 500) {
        bucket.latencies.shift();
      }
    }
  }

  getSummary(now = Date.now()): {
    sampleCount: number;
    successes: number;
    errors5xx: number;
    timeouts: number;
    networkErrors: number;
    rateLimits429: number;
    authFailures: number;
    infrastructureFailures: number;
    successRate: number;
    errorRate: number;
    timeoutRate: number;
    rateLimitRate: number;
    latency: RouteLatencyStats;
  } {
    this.prune(now);

    let successes = 0;
    let errors5xx = 0;
    let timeouts = 0;
    let networkErrors = 0;
    let rateLimits429 = 0;
    let authFailures = 0;
    const allLatencies: number[] = [];

    for (const b of this.buckets) {
      successes += b.successes;
      errors5xx += b.errors5xx;
      timeouts += b.timeouts;
      networkErrors += b.networkErrors;
      rateLimits429 += b.rateLimits429;
      authFailures += b.authFailures;
      allLatencies.push(...b.latencies);
    }

    // Qualifying infrastructure failures for circuit calculations
    const infrastructureFailures = errors5xx + timeouts + networkErrors;
    // Total evaluating requests (excluding client cancellations/400s)
    const sampleCount =
      successes + infrastructureFailures + rateLimits429 + authFailures;

    const successRate = sampleCount > 0 ? successes / sampleCount : 1.0;
    const errorRate =
      sampleCount > 0 ? infrastructureFailures / sampleCount : 0.0;
    const timeoutRate = sampleCount > 0 ? timeouts / sampleCount : 0.0;
    const rateLimitRate = sampleCount > 0 ? rateLimits429 / sampleCount : 0.0;

    // Latency percentiles
    allLatencies.sort((a, b) => a - b);
    const latencyCount = allLatencies.length;
    let p50LatencyMs: number | undefined;
    let p95LatencyMs: number | undefined;
    let averageLatencyMs: number | undefined;

    if (latencyCount > 0) {
      const p50Idx = Math.floor(latencyCount * 0.5);
      const p95Idx = Math.min(
        Math.floor(latencyCount * 0.95),
        latencyCount - 1,
      );
      p50LatencyMs = allLatencies[p50Idx];
      p95LatencyMs = allLatencies[p95Idx];
      const sum = allLatencies.reduce((acc, v) => acc + v, 0);
      averageLatencyMs = Math.round(sum / latencyCount);
    }

    return {
      sampleCount,
      successes,
      errors5xx,
      timeouts,
      networkErrors,
      rateLimits429,
      authFailures,
      infrastructureFailures,
      successRate,
      errorRate,
      timeoutRate,
      rateLimitRate,
      latency: {
        p50LatencyMs,
        p95LatencyMs,
        averageLatencyMs,
        sampleCount: latencyCount,
      },
    };
  }

  reset(): void {
    this.buckets = [];
  }
}
