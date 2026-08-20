import { describe, expect, it } from "vitest";
import { DeterministicCandidateRanker } from "../src/ranking.js";
import { buildRequestCapabilityProfile } from "../src/profile.js";
import type { RouteCandidate } from "../src/types.js";

describe("Router V2 - Deterministic Ranking", () => {
  const profile = buildRequestCapabilityProfile({
    canonicalModelId: "growx/fast",
    streaming: true,
  });

  const candFastExpensive: RouteCandidate = {
    routeId: "fast_exp",
    providerId: "openai",
    providerModelId: "gpt-4o",
    region: "us-east-1",
    priority: 10,
    weight: 1,
    capabilities: ["chat.stream"] as any,
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    health: "healthy",
    circuit: "CLOSED",
    p95LatencyMs: 120,
    estimatedCost: 2000,
  };

  const candSlowCheap: RouteCandidate = {
    routeId: "slow_cheap",
    providerId: "anthropic",
    providerModelId: "claude-haiku",
    region: "us-east-1",
    priority: 10,
    weight: 1,
    capabilities: ["chat.stream"] as any,
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    health: "healthy",
    circuit: "CLOSED",
    p95LatencyMs: 900,
    estimatedCost: 100,
  };

  it("selects fast route under lowest_latency objective", () => {
    const { topChoice } = DeterministicCandidateRanker.rank(
      [candFastExpensive, candSlowCheap],
      profile,
      { objective: "lowest_latency" }
    );
    expect(topChoice.routeId).toBe("fast_exp");
  });

  it("selects cheap route under lowest_cost objective", () => {
    const { topChoice } = DeterministicCandidateRanker.rank(
      [candFastExpensive, candSlowCheap],
      profile,
      { objective: "lowest_cost" }
    );
    expect(topChoice.routeId).toBe("slow_cheap");
  });

  it("applies customer provider preference boost", () => {
    const preferredProfile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      providerPreference: "anthropic",
    });

    const { topChoice } = DeterministicCandidateRanker.rank(
      [candFastExpensive, candSlowCheap],
      preferredProfile,
      { objective: "balanced" }
    );
    expect(topChoice.providerId).toBe("anthropic");
    expect(topChoice.score?.reasons).toContain("PREFERRED_PROVIDER_BONUS");
  });

  it("applies hysteresis penalty against route flapping", () => {
    const { topChoice } = DeterministicCandidateRanker.rank(
      [candFastExpensive, candSlowCheap],
      profile,
      {
        objective: "balanced",
        currentActiveRouteId: "fast_exp",
        hysteresisPenalty: 15,
      }
    );
    expect(topChoice.routeId).toBe("fast_exp");
  });

  it("produces deterministic tie-breaks across identical routes", () => {
    const identical1: RouteCandidate = { ...candFastExpensive, routeId: "route_b" };
    const identical2: RouteCandidate = { ...candFastExpensive, routeId: "route_a" };

    const r1 = DeterministicCandidateRanker.rank([identical1, identical2], profile);
    const r2 = DeterministicCandidateRanker.rank([identical2, identical1], profile);

    expect(r1.topChoice.routeId).toBe(r2.topChoice.routeId);
  });
});
