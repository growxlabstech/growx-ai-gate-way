import { describe, expect, it } from "vitest";
import {
  evaluateBalancedStrategy,
  evaluateLowestCostStrategy,
  evaluateLowestLatencyStrategy,
  evaluatePriorityStrategy,
  evaluateWeightedStrategy,
  rankCandidates,
  type RouteCandidate,
  type RoutingPolicy,
  type RoutingRequest,
} from "../src/index.js";

function createCandidate(id: string, overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    routeId: `route_${id}`,
    providerId: `provider_${id}`,
    providerModelId: `model_${id}`,
    publicModelId: `growx/${id}`,
    region: "global",
    priority: 100,
    weight: 50,
    capabilities: ["text.generate"] as any,
    routeStatus: "active",
    providerStatus: "active",
    routingEligible: true,
    hasActiveCredential: true,
    pricing: {
      inputPricePerMillionMinor: 100, // $1.00 / 1M
      outputPricePerMillionMinor: 200, // $2.00 / 1M
      currency: "USD",
    },
    latencySignal: {
      p95LatencyMs: 100,
      source: "telemetry",
    },
    availabilitySignal: {
      available: true,
      successRate: 0.99,
      source: "telemetry",
    },
    ...overrides,
  };
}

const req: RoutingRequest = {
  requestId: "req_test",
  requestedModel: "growx/fast",
  capabilities: ["text.generate"],
  stream: false,
  estimatedInputTokens: 1000,
  estimatedOutputTokens: 500,
};

describe("Routing Strategy Evaluators", () => {
  describe("Priority Strategy", () => {
    it("selects candidate with lowest priority number (highest priority)", () => {
      const c1 = createCandidate("c1", { priority: 20 });
      const c2 = createCandidate("c2", { priority: 10 });
      const c3 = createCandidate("c3", { priority: 50 });

      const ranked = evaluatePriorityStrategy([c1, c2, c3], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_c2");
      expect(ranked[1]!.candidate.routeId).toBe("route_c1");
      expect(ranked[2]!.candidate.routeId).toBe("route_c3");
    });

    it("uses lexical routeId as stable tie-breaker for equal priorities", () => {
      const cB = createCandidate("b", { routeId: "route_b", priority: 10 });
      const cA = createCandidate("a", { routeId: "route_a", priority: 10 });

      const ranked = evaluatePriorityStrategy([cB, cA], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_a");
      expect(ranked[1]!.candidate.routeId).toBe("route_b");
    });
  });

  describe("Lowest Cost Strategy", () => {
    it("selects candidate with lowest estimated provider cost", () => {
      const expensive = createCandidate("expensive", {
        pricing: { inputPricePerMillionMinor: 500, outputPricePerMillionMinor: 1000, currency: "USD" },
      });
      const cheap = createCandidate("cheap", {
        pricing: { inputPricePerMillionMinor: 50, outputPricePerMillionMinor: 100, currency: "USD" },
      });
      const medium = createCandidate("medium", {
        pricing: { inputPricePerMillionMinor: 200, outputPricePerMillionMinor: 400, currency: "USD" },
      });

      const ranked = evaluateLowestCostStrategy([expensive, cheap, medium], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_cheap");
      expect(ranked[1]!.candidate.routeId).toBe("route_medium");
      expect(ranked[2]!.candidate.routeId).toBe("route_expensive");
    });

    it("handles missing pricing by placing unknown route last", () => {
      const cheap = createCandidate("cheap", {
        pricing: { inputPricePerMillionMinor: 50, outputPricePerMillionMinor: 100, currency: "USD" },
      });
      const unknown = createCandidate("unknown", { pricing: undefined });

      const ranked = evaluateLowestCostStrategy([unknown, cheap], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_cheap");
    });
  });

  describe("Lowest Latency Strategy", () => {
    it("selects candidate with lowest p95 latency", () => {
      const fast = createCandidate("fast", { latencySignal: { p95LatencyMs: 30, source: "telemetry" } });
      const slow = createCandidate("slow", { latencySignal: { p95LatencyMs: 250, source: "telemetry" } });
      const medium = createCandidate("medium", { latencySignal: { p95LatencyMs: 85, source: "telemetry" } });

      const ranked = evaluateLowestLatencyStrategy([slow, fast, medium], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_fast");
      expect(ranked[1]!.candidate.routeId).toBe("route_medium");
      expect(ranked[2]!.candidate.routeId).toBe("route_slow");
    });
  });

  describe("Balanced Strategy", () => {
    it("combines cost, latency, availability, and priority according to weights", () => {
      const allRounder = createCandidate("allRounder", {
        priority: 10,
        pricing: { inputPricePerMillionMinor: 100, outputPricePerMillionMinor: 100, currency: "USD" },
        latencySignal: { p95LatencyMs: 50, source: "telemetry" },
        availabilitySignal: { available: true, successRate: 0.999, source: "telemetry" },
      });
      const poorAvailability = createCandidate("poorAvail", {
        priority: 5,
        pricing: { inputPricePerMillionMinor: 10, outputPricePerMillionMinor: 10, currency: "USD" },
        latencySignal: { p95LatencyMs: 40, source: "telemetry" },
        availabilitySignal: { available: true, successRate: 0.50, source: "telemetry" },
      });

      const policy: RoutingPolicy = {
        id: "pol_bal",
        name: "Balanced",
        strategy: "balanced",
        weights: { cost: 0.2, latency: 0.2, availability: 0.5, priority: 0.1 },
        enabled: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ranked = evaluateBalancedStrategy([poorAvailability, allRounder], req, policy);
      expect(ranked[0]!.candidate.routeId).toBe("route_allRounder");
      expect(ranked[0]!.reasons.some((r) => r.includes("highest_balanced_score"))).toBe(true);
    });
  });

  describe("Weighted Strategy", () => {
    it("selects according to weight distribution over large sample", () => {
      const cA = createCandidate("a", { weight: 70 });
      const cB = createCandidate("b", { weight: 30 });

      let countA = 0;
      let countB = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        // Deterministic pseudo-random sequence for repeatability
        const pseudoRng = () => (i * 0.6180339887) % 1;
        const ranked = evaluateWeightedStrategy([cA, cB], req, undefined, { rng: pseudoRng });
        if (ranked[0]!.candidate.routeId === "route_a") {
          countA++;
        } else {
          countB++;
        }
      }

      // 70% weight should yield ~65-75% of selections
      const proportionA = countA / iterations;
      expect(proportionA).toBeGreaterThan(0.60);
      expect(proportionA).toBeLessThan(0.80);
    });

    it("produces deterministic sticky routing for the same stableKey", () => {
      const cA = createCandidate("a", { weight: 70 });
      const cB = createCandidate("b", { weight: 30 });

      const key = "workspace_tenant_xyz_session_1";
      const first = evaluateWeightedStrategy([cA, cB], req, undefined, { stableKey: key });
      const second = evaluateWeightedStrategy([cA, cB], req, undefined, { stableKey: key });

      expect(first[0]!.candidate.routeId).toBe(second[0]!.candidate.routeId);
    });
  });

  describe("rankCandidates Dispatcher", () => {
    it("dispatches correctly to strategy evaluator", () => {
      const c1 = createCandidate("c1", { priority: 20 });
      const c2 = createCandidate("c2", { priority: 5 });

      const ranked = rankCandidates("priority", [c1, c2], req);
      expect(ranked[0]!.candidate.routeId).toBe("route_c2");
    });
  });
});
