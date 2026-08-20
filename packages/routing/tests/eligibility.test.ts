import { describe, expect, it } from "vitest";
import { evaluateEligibility, type RouteCandidate, type RoutingRequest } from "../src/index.js";

function createCandidate(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    routeId: "route_1",
    providerId: "openai",
    providerModelId: "gpt-4o",
    region: "global",
    priority: 10,
    weight: 100,
    capabilities: ["text.generate", "streaming", "tools.call"] as any,
    limits: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      maxInputTokens: 120_000,
    },
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    health: "healthy",
    circuit: "CLOSED",
    capacityState: "available",
    ...overrides,
  };
}

function createRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    requestId: "req_123",
    requestedModel: "openai/gpt-4o",
    capabilities: ["text.generate"],
    stream: false,
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    ...overrides,
  };
}

describe("Hard Eligibility Filters", () => {
  it("allows eligible route with valid credentials and capabilities", () => {
    const candidate = createCandidate();
    const req = createRequest();
    const result = evaluateEligibility(candidate, req);
    expect(result.eligible).toBe(true);
    expect(result.exclusionReason).toBeUndefined();
  });

  it("excludes route when routingEligible is false (ROUTE_DISABLED)", () => {
    const candidate = createCandidate({ routingEligible: false });
    const result = evaluateEligibility(candidate, createRequest());
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("ROUTE_DISABLED");
  });

  it("excludes route when routeStatus is disabled or retired (ROUTE_DISABLED)", () => {
    const disabled = createCandidate({ routeStatus: "disabled" });
    expect(evaluateEligibility(disabled, createRequest()).exclusionReason).toBe("ROUTE_DISABLED");

    const retired = createCandidate({ routeStatus: "retired" });
    expect(evaluateEligibility(retired, createRequest()).exclusionReason).toBe("ROUTE_DISABLED");
  });

  it("excludes route when providerStatus is disabled/maintenance/retired (PROVIDER_DISABLED)", () => {
    const disabled = createCandidate({ providerStatus: "disabled" });
    expect(evaluateEligibility(disabled, createRequest()).exclusionReason).toBe("PROVIDER_DISABLED");

    const maint = createCandidate({ providerStatus: "maintenance" });
    expect(evaluateEligibility(maint, createRequest()).exclusionReason).toBe("PROVIDER_DISABLED");

    const retired = createCandidate({ providerStatus: "retired" });
    expect(evaluateEligibility(retired, createRequest()).exclusionReason).toBe("PROVIDER_DISABLED");
  });

  it("excludes route when health is unhealthy or maintenance (UNAVAILABLE)", () => {
    const unhealthy = createCandidate({ health: "unhealthy" });
    expect(evaluateEligibility(unhealthy, createRequest()).exclusionReason).toBe("UNAVAILABLE");

    const maint = createCandidate({ health: "maintenance" });
    expect(evaluateEligibility(maint, createRequest()).exclusionReason).toBe("UNAVAILABLE");
  });

  it("excludes route when circuit is OPEN (CIRCUIT_OPEN)", () => {
    const open = createCandidate({ circuit: "OPEN" });
    expect(evaluateEligibility(open, createRequest()).exclusionReason).toBe("CIRCUIT_OPEN");
  });

  it("excludes route when capacity is exhausted (NO_CAPACITY)", () => {
    const exhausted = createCandidate({ capacityState: "exhausted" });
    expect(evaluateEligibility(exhausted, createRequest()).exclusionReason).toBe("NO_CAPACITY");
  });

  it("excludes route when no active credential exists (NO_CREDENTIAL)", () => {
    const noCred = createCandidate({ hasActiveCredential: false });
    expect(evaluateEligibility(noCred, createRequest()).exclusionReason).toBe("NO_CREDENTIAL");
  });

  it("excludes route when required capabilities are missing (CAPABILITY_MISMATCH)", () => {
    const candidate = createCandidate({ capabilities: ["text.generate"] as any });
    const req = createRequest({ capabilities: ["text.generate", "tools.call" as any] });
    const result = evaluateEligibility(candidate, req);
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("CAPABILITY_MISMATCH");
  });

  it("excludes route when context limits are exceeded (CONTEXT_LIMIT)", () => {
    const candidate = createCandidate({
      limits: { contextWindow: 4000, maxOutputTokens: 2000, maxInputTokens: 3000 },
    });
    const req = createRequest({ estimatedInputTokens: 5000 });
    const result = evaluateEligibility(candidate, req);
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("CONTEXT_LIMIT");
  });

  it("excludes route when output limit is exceeded (OUTPUT_LIMIT)", () => {
    const candidate = createCandidate({
      limits: { contextWindow: 4000, maxOutputTokens: 1000 },
    });
    const req = createRequest({ estimatedOutputTokens: 2000 });
    const result = evaluateEligibility(candidate, req);
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("OUTPUT_LIMIT");
  });

  it("excludes route when provider is in deniedProviders list (PROVIDER_DENIED)", () => {
    const candidate = createCandidate({ providerId: "openai" });
    const result = evaluateEligibility(candidate, createRequest(), {
      id: "p1",
      name: "Policy",
      strategy: "priority",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deniedProviders: ["openai"],
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("PROVIDER_DENIED");
  });

  it("excludes route when provider is not in allowedProviders list (PROVIDER_DENIED)", () => {
    const candidate = createCandidate({ providerId: "anthropic" });
    const result = evaluateEligibility(candidate, createRequest(), {
      id: "p1",
      name: "Policy",
      strategy: "priority",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      allowedProviders: ["openai"],
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("PROVIDER_DENIED");
  });

  it("excludes route when region is in deniedRegions list (REGION_DENIED)", () => {
    const candidate = createCandidate({ region: "us-east-1" });
    const result = evaluateEligibility(candidate, createRequest(), {
      id: "p1",
      name: "Policy",
      strategy: "priority",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deniedRegions: ["us-east-1"],
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("REGION_DENIED");
  });

  it("excludes route when data residency requires specific region (REGION_DENIED)", () => {
    const usCandidate = createCandidate({ region: "us-east" });
    const indiaCandidate = createCandidate({ region: "india" });

    const policy = {
      id: "p1",
      name: "Policy",
      strategy: "priority" as const,
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      dataRegion: "india",
    };

    expect(evaluateEligibility(usCandidate, createRequest(), policy).exclusionReason).toBe("REGION_DENIED");
    expect(evaluateEligibility(indiaCandidate, createRequest(), policy).eligible).toBe(true);
  });

  it("excludes route when estimated cost exceeds maxEstimatedProviderCost (COST_LIMIT)", () => {
    const candidate = createCandidate();
    const policy = {
      id: "p1",
      name: "Policy",
      strategy: "priority" as const,
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      maxEstimatedProviderCost: 0.05,
    };
    const result = evaluateEligibility(candidate, createRequest(), policy, 0.10);
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("COST_LIMIT");
  });
});
