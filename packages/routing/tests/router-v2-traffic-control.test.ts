import { describe, expect, it } from "vitest";
import { TrafficControlEvaluator } from "../src/traffic-control.js";
import type { RouteCandidate } from "../src/types.js";
import type { RouteTrafficControl } from "@growx/contracts";

describe("Router V2 - Traffic Controls & Canary", () => {
  const candidate: RouteCandidate = {
    routeId: "r1",
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
  };

  it("excludes disabled routes immediately", () => {
    const controls = new Map<string, RouteTrafficControl>();
    controls.set("r1", {
      id: "c1",
      routeId: "r1",
      mode: "disabled",
      disabled: true,
      maxTrafficPercent: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const eligible = TrafficControlEvaluator.applyControls(
      [candidate],
      controls,
      "org_1",
    );
    expect(eligible.length).toBe(0);
  });

  it("excludes draining routes from new incoming traffic", () => {
    const controls = new Map<string, RouteTrafficControl>();
    controls.set("r1", {
      id: "c1",
      routeId: "r1",
      mode: "draining",
      drain: true,
      maxTrafficPercent: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const eligible = TrafficControlEvaluator.applyControls(
      [candidate],
      controls,
      "org_1",
    );
    expect(eligible.length).toBe(0);
  });

  it("splits canary traffic deterministically by partition key", () => {
    const controls = new Map<string, RouteTrafficControl>();
    controls.set("r1", {
      id: "c1",
      routeId: "r1",
      mode: "canary",
      maxTrafficPercent: 50,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      const el = TrafficControlEvaluator.applyControls(
        [candidate],
        controls,
        `org_test_${i}`,
      );
      if (el.length > 0) allowed++;
    }

    // Expect approximately 50% partition allocation
    expect(allowed).toBeGreaterThanOrEqual(30);
    expect(allowed).toBeLessThanOrEqual(70);
  });
});
