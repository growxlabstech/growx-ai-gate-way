import { describe, expect, it } from "vitest";
import { HardConstraintFilter } from "../src/filters.js";
import { buildRequestCapabilityProfile } from "../src/profile.js";
import type { RouteCandidate } from "../src/types.js";

describe("Router V2 - Hard Constraint Filters", () => {
  const baseCandidate: RouteCandidate = {
    routeId: "route_openai_gpt4",
    providerId: "openai",
    providerModelId: "gpt-4o",
    region: "us-east-1",
    priority: 10,
    weight: 1,
    capabilities: [
      "chat.stream",
      "tools.call",
      "vision.read",
      "text.reason",
    ] as any,
    limits: { contextWindow: 128000, maxOutputTokens: 4096 },
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    health: "healthy",
    circuit: "CLOSED",
    capacityState: "available",
    estimatedCost: 1000,
  };

  it("accepts a candidate that meets all criteria", () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: true,
      toolCalling: true,
      contextTokensEstimated: 2000,
      maxOutputTokens: 1000,
    });

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [baseCandidate],
      profile,
    );
    expect(eligible.length).toBe(1);
    expect(rejected.length).toBe(0);
  });

  it("rejects disabled routes or providers", () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
    });

    const c1: RouteCandidate = { ...baseCandidate, routeStatus: "disabled" };
    const c2: RouteCandidate = {
      ...baseCandidate,
      providerStatus: "maintenance",
    };
    const c3: RouteCandidate = { ...baseCandidate, routingEligible: false };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [c1, c2, c3],
      profile,
    );
    expect(eligible.length).toBe(0);
    expect(rejected.length).toBe(3);
    expect(rejected[0]!.rejectionReason).toBe("ROUTE_STATUS_INACTIVE");
    expect(rejected[1]!.rejectionReason).toBe("PROVIDER_STATUS_INACTIVE");
    expect(rejected[2]!.rejectionReason).toBe("ROUTING_INELIGIBLE");
  });

  it("rejects open or forced-open circuits", () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
    });

    const c1: RouteCandidate = { ...baseCandidate, circuit: "OPEN" };
    const c2: RouteCandidate = { ...baseCandidate, circuit: "FORCED_OPEN" };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [c1, c2],
      profile,
    );
    expect(eligible.length).toBe(0);
    expect(rejected[0]!.rejectionReason).toBe("CIRCUIT_OPEN");
    expect(rejected[1]!.rejectionReason).toBe("CIRCUIT_FORCED_OPEN");
  });

  it("enforces allowed and denied provider lists", () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
    });

    const { eligible: el1 } = HardConstraintFilter.filterCandidates(
      [baseCandidate],
      profile,
      {
        deniedProviders: ["openai"],
      },
    );
    expect(el1.length).toBe(0);

    const { eligible: el2 } = HardConstraintFilter.filterCandidates(
      [baseCandidate],
      profile,
      {
        allowedProviders: ["anthropic"],
      },
    );
    expect(el2.length).toBe(0);

    const { eligible: el3 } = HardConstraintFilter.filterCandidates(
      [baseCandidate],
      profile,
      {
        allowedProviders: ["openai"],
      },
    );
    expect(el3.length).toBe(1);
  });

  it("enforces data residency requirements", () => {
    const profileIndia = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      dataResidencyRequirement: "india",
    });

    const cIndia: RouteCandidate = { ...baseCandidate, region: "ap-south-1" };
    const cUS: RouteCandidate = { ...baseCandidate, region: "us-east-1" };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [cIndia, cUS],
      profileIndia,
      { dataResidency: "india" },
    );

    expect(eligible.length).toBe(1);
    expect(eligible[0]!.region).toBe("ap-south-1");
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.rejectionReason).toBe("DATA_RESIDENCY_MISMATCH");
  });

  it("enforces context window and max output limits", () => {
    const profileBig = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      contextTokensEstimated: 150000,
    });

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [baseCandidate],
      profileBig,
    );
    expect(eligible.length).toBe(0);
    expect(rejected[0]!.rejectionReason).toBe("CONTEXT_WINDOW_EXCEEDED");
  });

  it("enforces required capabilities", () => {
    const profileVision = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      inputModalities: ["image"],
    });

    const cNoVision: RouteCandidate = {
      ...baseCandidate,
      capabilities: ["chat.stream"] as any,
    };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [cNoVision],
      profileVision,
    );
    expect(eligible.length).toBe(0);
    expect(rejected[0]!.rejectionReason).toBe("VISION_INPUT_NOT_SUPPORTED");
  });

  it("rejects candidates exceeding maxExecutionCostMinor", () => {
    const profileBudget = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      maxExecutionCostMinor: 500,
    });

    const cExpensive: RouteCandidate = {
      ...baseCandidate,
      estimatedCost: 1000,
    };
    const cAffordable: RouteCandidate = {
      ...baseCandidate,
      estimatedCost: 400,
    };

    const { eligible, rejected } = HardConstraintFilter.filterCandidates(
      [cExpensive, cAffordable],
      profileBudget,
      { maxExecutionCostMinor: 500 },
    );

    expect(eligible.length).toBe(1);
    expect(eligible[0]!.estimatedCost).toBe(400);
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.rejectionReason).toBe("ESTIMATED_COST_EXCEEDED");
  });
});
