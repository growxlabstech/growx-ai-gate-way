import type { PerformanceMetricSnapshot } from "@growx/contracts";

export interface SpanTiming {
  name: string;
  durationMs: number;
}

export class PlatformProfiler {
  public static calculatePercentiles(values: number[]): {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const getP = (p: number) => {
      const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
      return sorted[idx] ?? 0;
    };
    return {
      p50: getP(0.5),
      p75: getP(0.75),
      p90: getP(0.9),
      p95: getP(0.95),
      p99: getP(0.99),
    };
  }

  public static measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = performance.now();
      setImmediate(() => {
        const delta = performance.now() - start;
        resolve(Math.max(0, delta));
      });
    });
  }

  public static getMemorySnapshot(): { heapUsedMb: number; rssMb: number } {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      };
    }
    return { heapUsedMb: 0, rssMb: 0 };
  }
}
