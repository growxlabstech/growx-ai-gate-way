import { describe, expect, it } from "vitest";
import { RoutingAnalyticsService } from "../src/routing.js";
describe("routing analytics", () => {
  it("requires a valid bounded interval", () => {
    const service = new RoutingAnalyticsService({
      async query() {
        return {
          requests: 1,
          fallbackRate: 0,
          cacheHitRate: 0,
          errorRate: 0,
          p50LatencyMs: 1,
          p95LatencyMs: 2,
          providerDistribution: {},
          modelDistribution: {},
        };
      },
    });
    expect(() =>
      service.get({
        organizationId: "o",
        workspaceId: "w",
        from: new Date(1),
        to: new Date(0),
      }),
    ).toThrow("Invalid analytics interval");
  });
});
