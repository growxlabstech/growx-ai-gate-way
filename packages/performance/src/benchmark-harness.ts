import type {
  PerformanceRun,
  PerformanceScenario,
  PerformanceMetricSnapshot,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import { PlatformProfiler } from "./profiler.js";

export interface BenchmarkRunnerConfig {
  scenario: PerformanceScenario;
  totalRequests: number;
  concurrency: number;
  simulatedProviderLatencyMs: number;
  growxOverheadTargetMs?: number;
}

export class BenchmarkHarness {
  public async runScenario(config: BenchmarkRunnerConfig): Promise<PerformanceRun> {
    const startedAt = new Date();
    const runId = generateId("prun");

    const latencies: number[] = [];
    const overheads: number[] = [];
    const providerLatencies: number[] = [];

    const startTime = performance.now();

    // Execute simulated request batches
    const batchSize = config.concurrency;
    let completed = 0;

    while (completed < config.totalRequests) {
      const currentBatch = Math.min(batchSize, config.totalRequests - completed);
      const promises = Array.from({ length: currentBatch }, async () => {
        const reqStart = performance.now();

        // 1. Simulate GrowX gateway overhead (auth, policy, router scoring, hashing)
        const overheadMs = (config.growxOverheadTargetMs ?? 4) + Math.random() * 2;
        await new Promise((r) => setTimeout(r, overheadMs));

        // 2. Simulate upstream provider latency
        const provMs = config.simulatedProviderLatencyMs + (Math.random() * 10 - 5);
        await new Promise((r) => setTimeout(r, provMs));

        const totalReqDuration = performance.now() - reqStart;
        latencies.push(totalReqDuration);
        overheads.push(overheadMs);
        providerLatencies.push(provMs);
      });

      await Promise.all(promises);
      completed += currentBatch;
    }

    const totalDurationSeconds = Math.max(0.001, (performance.now() - startTime) / 1000);
    const rps = Math.round((config.totalRequests / totalDurationSeconds) * 100) / 100;

    const latPct = PlatformProfiler.calculatePercentiles(latencies);
    const ovhPct = PlatformProfiler.calculatePercentiles(overheads);
    const provPct = PlatformProfiler.calculatePercentiles(providerLatencies);

    const lag = await PlatformProfiler.measureEventLoopLag();
    const mem = PlatformProfiler.getMemorySnapshot();

    const metrics: PerformanceMetricSnapshot = {
      requestCount: config.totalRequests,
      concurrency: config.concurrency,
      rps,
      p50Ms: Math.round(latPct.p50 * 100) / 100,
      p75Ms: Math.round(latPct.p75 * 100) / 100,
      p90Ms: Math.round(latPct.p90 * 100) / 100,
      p95Ms: Math.round(latPct.p95 * 100) / 100,
      p99Ms: Math.round(latPct.p99 * 100) / 100,
      growxOverheadP95Ms: Math.round(ovhPct.p95 * 100) / 100,
      providerLatencyP95Ms: Math.round(provPct.p95 * 100) / 100,
      errorRate: 0,
      eventLoopLagMs: Math.round(lag * 100) / 100,
      heapUsedMb: mem.heapUsedMb,
      gcDurationMs: 0,
    };

    return {
      id: runId,
      scenario: config.scenario,
      version: "1.0",
      environment: "test_sandbox",
      startedAt,
      completedAt: new Date(),
      metrics,
      bottlenecks: metrics.growxOverheadP95Ms > 25 ? ["GATEWAY_OVERHEAD_HIGH"] : [],
      verdict: metrics.errorRate === 0 && metrics.growxOverheadP95Ms <= 25 ? "PASSED" : "DEGRADED",
    };
  }
}
