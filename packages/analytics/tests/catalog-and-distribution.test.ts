import { describe, expect, it } from "vitest";
import {
  METRIC_CATALOG,
  isValidMetric,
} from "../src/catalog.js";
import {
  LatencyDistributionSketch,
  LATENCY_BUCKET_UPPER_BOUNDS,
} from "../src/distribution.js";

describe("Metric Catalog & Dimension Allowlist", () => {
  it("defines standard gateway metrics with correct units and types", () => {
    expect(METRIC_CATALOG["requests_total"]).toBeDefined();
    expect(METRIC_CATALOG["requests_total"]?.unit).toBe("count");
    expect(METRIC_CATALOG["requests_total"]?.customerVisible).toBe(true);

    expect(METRIC_CATALOG["input_tokens"]).toBeDefined();
    expect(METRIC_CATALOG["input_tokens"]?.unit).toBe("tokens");
    expect(METRIC_CATALOG["input_tokens"]?.customerVisible).toBe(true);

    expect(METRIC_CATALOG["provider_total_tokens"]).toBeDefined();
    expect(METRIC_CATALOG["provider_total_tokens"]?.customerVisible).toBe(false);

    expect(METRIC_CATALOG["latency_p95"]).toBeDefined();
    expect(METRIC_CATALOG["latency_p95"]?.unit).toBe("milliseconds");

    expect(METRIC_CATALOG["retry_amplification"]).toBeDefined();
    expect(METRIC_CATALOG["retry_amplification"]?.unit).toBe("ratio");
  });

  it("validates metric names and customer visibility constraints", () => {
    expect(isValidMetric("requests_total")).toBe(true);
    expect(isValidMetric("requests_total", true)).toBe(true);

    expect(isValidMetric("provider_total_tokens")).toBe(true);
    expect(isValidMetric("provider_total_tokens", true)).toBe(false);

    expect(isValidMetric("unknown_custom_metric")).toBe(false);
  });
});

describe("Mergeable Latency Distribution Sketch", () => {
  it("records samples and accurately calculates percentiles", () => {
    const sketch = new LatencyDistributionSketch();
    // Record 100 samples uniformly from 1 to 100ms
    for (let i = 1; i <= 100; i++) {
      sketch.record(i);
    }

    expect(sketch.count).toBe(100);
    expect(sketch.minMs).toBe(1);
    expect(sketch.maxMs).toBe(100);
    expect(sketch.mean()).toBe(50.5);

    const p50 = sketch.percentile(50);
    const p90 = sketch.percentile(90);
    const p95 = sketch.percentile(95);
    const p99 = sketch.percentile(99);

    expect(p50).toBeGreaterThanOrEqual(45);
    expect(p50).toBeLessThanOrEqual(55);
    expect(p95).toBeGreaterThanOrEqual(90);
    expect(p95).toBeLessThanOrEqual(99);
    expect(p99).toBeGreaterThanOrEqual(95);
    expect(p99).toBeLessThanOrEqual(100);
  });

  it("merges multi-hour sketches accurately without averaging percentiles", () => {
    // Hour 1: 50 fast requests (all around 20ms)
    const hour1 = new LatencyDistributionSketch();
    for (let i = 0; i < 50; i++) {
      hour1.record(20);
    }

    // Hour 2: 50 slow requests (all around 200ms)
    const hour2 = new LatencyDistributionSketch();
    for (let i = 0; i < 50; i++) {
      hour2.record(200);
    }

    // Combined Daily sketch (merging hour1 and hour2)
    const daily = new LatencyDistributionSketch();
    daily.merge(hour1);
    daily.merge(hour2);

    expect(daily.count).toBe(100);
    expect(daily.minMs).toBe(20);
    expect(daily.maxMs).toBe(200);
    expect(daily.mean()).toBe(110);

    // If one averaged hour1.p95 (20) and hour2.p95 (200), result would be 110
    // But actual daily p95 should be ~200ms because top 5% fall into the 200ms cluster!
    const dailyP95 = daily.percentile(95);
    expect(dailyP95).toBeGreaterThanOrEqual(190);
    expect(dailyP95).toBeLessThanOrEqual(200);
  });

  it("serializes and deserializes to JSON safely", () => {
    const sketch = new LatencyDistributionSketch();
    sketch.record(15);
    sketch.record(120);

    const json = sketch.toJSON();
    expect(json.count).toBe(2);

    const restored = LatencyDistributionSketch.fromJSON(json);
    expect(restored.count).toBe(2);
    expect(restored.minMs).toBe(15);
    expect(restored.maxMs).toBe(120);
  });
});
