import { describe, expect, it } from "vitest";
import type {
  PolicyVersion,
  RouteCandidate,
  RoutingRequest,
} from "@growx/routing";
import { AdvancedRoutingService } from "../src/advanced.js";
const request: RoutingRequest = {
  requestId: "r",
  organizationId: "o",
  workspaceId: "w",
  environmentId: "e",
  requestedModel: "growx/fast",
  capabilities: ["text"],
  stream: false,
  estimatedInputTokens: 10,
  estimatedOutputTokens: 10,
};
const policy: PolicyVersion = {
  id: "v",
  policyId: "p",
  version: 1,
  level: "workspace",
  strategy: "priority",
  weights: {
    cost: 0.2,
    latency: 0.2,
    availability: 0.2,
    reliability: 0.2,
    capacity: 0.2,
    preference: 0.2,
    priority: 0.2,
  },
  status: "active",
};
const candidate: RouteCandidate = {
  routeId: "route_p",
  region: "global",
  routeStatus: "active",
  providerStatus: "active",
  routingEligible: true,
  hasActiveCredential: true,
  providerId: "p",
  providerModelId: "m",
  publicModelId: "p/m",
  capabilities: new Set(["text"]),
  priority: 1,
  priceInputPerMillionMinor: 1n,
  priceOutputPerMillionMinor: 1n,
  p95LatencyMs: 1,
  reliability: 1,
  capacityUtilization: 0,
  capacityState: "available",
  health: "healthy",
  circuit: "CLOSED",
  weight: 1,
};
describe("advanced routing service", () => {
  it("persists the complete decision", async () => {
    let saved = "";
    const service = new AdvancedRoutingService(
      {
        async policies() {
          return [policy];
        },
        async candidates() {
          return [candidate];
        },
        async mode() {
          return "NORMAL";
        },
      },
      {
        async save(value) {
          saved = value.id;
        },
      },
      () => "decision_a",
    );
    expect((await service.decide(request)).primary.providerId).toBe("p");
    expect(saved).toBe("decision_a");
  });
});
