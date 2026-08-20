import { describe, expect, it } from "vitest";
import { FallbackPlanBuilder } from "../src/fallback-plan.js";
import type { RankedCandidateRecord } from "@growx/contracts";

describe("Router V2 - Fallback Plan & Failure Domain Isolation", () => {
  const ranked: RankedCandidateRecord[] = [
    {
      routeId: "r1",
      providerId: "openai",
      providerModelId: "gpt-4o",
      region: "us-east-1",
      rank: 1,
      eligible: true,
      failureDomain: { routeId: "r1", providerId: "openai", region: "us-east-1", credentialId: "cred_1" },
    },
    {
      routeId: "r2",
      providerId: "openai",
      providerModelId: "gpt-4o-mini",
      region: "us-east-1",
      rank: 2,
      eligible: true,
      failureDomain: { routeId: "r2", providerId: "openai", region: "us-east-1", credentialId: "cred_1" },
    },
    {
      routeId: "r3",
      providerId: "anthropic",
      providerModelId: "claude-3-5-sonnet",
      region: "us-east-1",
      rank: 3,
      eligible: true,
      failureDomain: { routeId: "r3", providerId: "anthropic", region: "us-east-1", credentialId: "cred_2" },
    },
  ];

  it("builds a plan with selectedCandidate and fallback chain", () => {
    const plan = FallbackPlanBuilder.buildPlan({
      rankedCandidates: ranked,
      policyVersion: 1,
      objective: "balanced",
      requestProfileHash: "hash_123",
    });

    expect(plan.selectedCandidate.routeId).toBe("r1");
    expect(plan.fallbacks.length).toBe(2);
    expect(plan.fallbacks[0]!.routeId).toBe("r2");
    expect(plan.fallbacks[1]!.routeId).toBe("r3");
  });

  it("excludes correlated credential failure domain on 401/403", () => {
    const plan = FallbackPlanBuilder.buildPlan({
      rankedCandidates: ranked,
      policyVersion: 1,
      objective: "balanced",
      requestProfileHash: "hash_123",
    });

    // Failing r1 with 401 should exclude r2 (same credential) and pick r3
    const next = FallbackPlanBuilder.getNextFallback(plan, [
      { routeId: "r1", providerId: "openai", statusCode: 401 },
    ]);
    expect(next).toBeDefined();
    expect(next?.routeId).toBe("r3");
  });

  it("excludes entire provider failure domain on 500 server error", () => {
    const plan = FallbackPlanBuilder.buildPlan({
      rankedCandidates: ranked,
      policyVersion: 1,
      objective: "balanced",
      requestProfileHash: "hash_123",
    });

    // Failing r1 with 500 should exclude all openai routes and pick anthropic r3
    const next = FallbackPlanBuilder.getNextFallback(plan, [
      { routeId: "r1", providerId: "openai", statusCode: 500 },
    ]);
    expect(next).toBeDefined();
    expect(next?.routeId).toBe("r3");
  });
});
