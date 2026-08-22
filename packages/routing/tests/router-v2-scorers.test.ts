import { describe, expect, it } from "vitest";
import { LatencyScorer } from "../src/scorers/latency-scorer.js";
import { CostScorer } from "../src/scorers/cost-scorer.js";
import { ReliabilityScorer } from "../src/scorers/reliability-scorer.js";
import { CapacityScorer } from "../src/scorers/capacity-scorer.js";
import { LocalityScorer } from "../src/scorers/locality-scorer.js";
import { buildRequestCapabilityProfile } from "../src/profile.js";
import type { RouteCandidate } from "../src/types.js";

describe("Router V2 - Objective Scorers", () => {
  const base: RouteCandidate = {
    routeId: "r1",
    providerId: "openai",
    providerModelId: "m1",
    region: "us-east-1",
    priority: 10,
    weight: 1,
    capabilities: ["streaming"] as any,
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    health: "healthy",
    circuit: "CLOSED",
  };

  it("scores latency with cold bootstrap and fast penalty bounds", () => {
    const fast = LatencyScorer.score({ ...base, p95LatencyMs: 150 });
    const slow = LatencyScorer.score({ ...base, p95LatencyMs: 3000 });
    const cold = LatencyScorer.score({ ...base, p95LatencyMs: undefined });

    expect(fast.score).toBeGreaterThan(slow.score);
    expect(fast.score).toBeGreaterThanOrEqual(90);
    expect(slow.score).toBeLessThanOrEqual(50);
    expect(cold.score).toBe(70); // bootstrap default
  });

  it("scores cost relative to other candidate options", () => {
    const cCheap = { ...base, routeId: "cheap", estimatedCost: 100 };
    const cMid = { ...base, routeId: "mid", estimatedCost: 500 };
    const cExpensive = { ...base, routeId: "exp", estimatedCost: 1000 };
    const all = [cCheap, cMid, cExpensive];

    const sCheap = CostScorer.score(cCheap, all);
    const sMid = CostScorer.score(cMid, all);
    const sExp = CostScorer.score(cExpensive, all);

    expect(sCheap.score).toBe(100);
    expect(sMid.score).toBeGreaterThan(sExp.score);
    expect(sExp.score).toBeLessThan(sCheap.score);
  });

  it("scores reliability from health, circuits, and telemetry", () => {
    const sHealthy = ReliabilityScorer.score({
      ...base,
      health: "healthy",
      circuit: "CLOSED",
    });
    const sDegraded = ReliabilityScorer.score({
      ...base,
      health: "degraded",
      circuit: "CLOSED",
    });
    const sHalfOpen = ReliabilityScorer.score({
      ...base,
      health: "healthy",
      circuit: "HALF_OPEN",
    });

    expect(sHealthy.score).toBe(100);
    expect(sDegraded.score).toBe(60);
    expect(sHalfOpen.score).toBe(60);
  });

  it("scores capacity headroom and state", () => {
    const sAvail = CapacityScorer.score({
      ...base,
      capacityState: "available",
      capacityUtilization: 0.1,
    });
    const sBusy = CapacityScorer.score({
      ...base,
      capacityState: "busy",
      capacityUtilization: 0.75,
    });
    const sExhausted = CapacityScorer.score({
      ...base,
      capacityState: "exhausted",
    });

    expect(sAvail.score).toBeGreaterThan(sBusy.score);
    expect(sExhausted.score).toBe(0);
  });

  it("scores locality matches against requested region", () => {
    const profileIndia = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      regionRequirement: "ap-south-1",
    });

    const sExact = LocalityScorer.score(
      { ...base, region: "ap-south-1" },
      profileIndia,
    );
    const sOther = LocalityScorer.score(
      { ...base, region: "us-west-2" },
      profileIndia,
    );

    expect(sExact.score).toBe(100);
    expect(sOther.score).toBe(60);
  });
});
