import { describe, it, expect } from "vitest";
import { BenchmarkHarness } from "../src/benchmark-harness.js";

describe("BenchmarkHarness", () => {
  const harness = new BenchmarkHarness();

  it("executes a simulated scenario, measuring separate GrowX overhead and provider latency", async () => {
    const run = await harness.runScenario({
      scenario: "smoke_1k",
      totalRequests: 20,
      concurrency: 5,
      simulatedProviderLatencyMs: 15,
      growxOverheadTargetMs: 3,
    });

    expect(run.id).toBeDefined();
    expect(run.scenario).toBe("smoke_1k");
    expect(run.metrics.requestCount).toBe(20);
    expect(run.metrics.growxOverheadP95Ms).toBeGreaterThan(0);
    expect(run.metrics.providerLatencyP95Ms).toBeGreaterThan(0);
    expect(run.verdict).toBe("PASSED");
  });
});
