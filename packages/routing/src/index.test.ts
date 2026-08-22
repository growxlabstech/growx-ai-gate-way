import { describe, expect, it } from "vitest";
import {
  healthScore,
  resolvePolicy,
  route,
  weightedSelect,
  type PolicyVersion,
  type RouteCandidate,
} from "./index.js";
const candidate = (
  providerId: string,
  cost: bigint,
  latency: number,
  reliability: number,
  weight = 1,
): RouteCandidate => ({
  routeId: `route_${providerId}`,
  providerId,
  providerModelId: "m",
  publicModelId: `${providerId}/m`,
  region: "global",
  routeStatus: "active",
  providerStatus: "active",
  routingEligible: true,
  hasActiveCredential: true,
  capabilities: new Set(["text"]),
  priority: providerId === "a" ? 1 : 2,
  priceInputPerMillionMinor: cost,
  priceOutputPerMillionMinor: cost,
  p95LatencyMs: latency,
  reliability,
  capacityUtilization: 0.2,
  capacityState: "available",
  health: "healthy",
  circuit: "CLOSED",
  weight,
});
const weights = {
  cost: 0.3,
  latency: 0.3,
  availability: 0.3,
  reliability: 0.3,
  capacity: 0.05,
  preference: 0.05,
  priority: 0.1,
};
const policy = (strategy: PolicyVersion["strategy"]): PolicyVersion => ({
  id: "v",
  policyId: "p",
  version: 1,
  level: "workspace",
  strategy,
  weights,
  status: "active",
});
const request = {
  requestId: "r",
  organizationId: "o",
  workspaceId: "w",
  environmentId: "e",
  requestedModel: "growx/fast",
  capabilities: ["text" as const],
  stream: false,
  estimatedInputTokens: 1_000_000,
  estimatedOutputTokens: 1_000_000,
};
describe("advanced routing", () => {
  it("applies specific policy precedence", () =>
    expect(
      resolvePolicy([
        { ...policy("priority"), level: "global" },
        { ...policy("lowest_cost"), id: "specific", level: "workspace" },
      ]).id,
    ).toBe("specific"));
  it("routes by cost, latency, and reliability", () => {
    const values = [
      candidate("a", 1000n, 500, 0.8),
      candidate("b", 100n, 100, 0.99),
    ];
    expect(
      route(request, values, policy("lowest_cost"), "NORMAL", () => "d").primary
        .providerId,
    ).toBe("b");
    expect(
      route(request, values, policy("lowest_latency"), "NORMAL", () => "d")
        .primary.providerId,
    ).toBe("b");
    expect(
      route(request, values, policy("highest_reliability"), "NORMAL", () => "d")
        .primary.providerId,
    ).toBe("b");
  });
  it("uses stable weighted assignment", () => {
    const first = weightedSelect(
      [candidate("a", 1n, 1, 1, 70), candidate("b", 1n, 1, 1, 30)],
      "same",
    );
    const second = weightedSelect(
      [candidate("a", 1n, 1, 1, 70), candidate("b", 1n, 1, 1, 30)],
      "same",
    );
    expect(first.providerId).toBe(second.providerId);
  });
  it("scores health on a 0-100 range", () =>
    expect(
      healthScore({
        successRate: 1,
        timeoutRate: 0,
        serverErrorRate: 0,
        rateLimitRate: 0,
        streamFailureRate: 0,
        latencyScore: 1,
        capacityScore: 1,
      }),
    ).toBe(100));
});
