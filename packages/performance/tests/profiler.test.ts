import { describe, it, expect } from 'vitest';
import { PlatformProfiler } from '../src/profiler.js';

describe('PlatformProfiler', () => {
  it('calculates accurate p50, p75, p90, p95, and p99 percentiles', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1 to 100
    const p = PlatformProfiler.calculatePercentiles(samples);

    expect(p.p50).toBe(51);
    expect(p.p75).toBe(76);
    expect(p.p90).toBe(91);
    expect(p.p95).toBe(96);
    expect(p.p99).toBe(100);
  });

  it('measures event loop lag and captures memory snapshots safely', async () => {
    const lag = await PlatformProfiler.measureEventLoopLag();
    expect(lag).toBeGreaterThanOrEqual(0);

    const mem = PlatformProfiler.getMemorySnapshot();
    expect(mem.heapUsedMb).toBeGreaterThan(0);
    expect(mem.rssMb).toBeGreaterThan(0);
  });
});
