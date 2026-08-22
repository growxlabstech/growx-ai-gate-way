import { describe, it, expect } from "vitest";
import { RuntimeCanaryController } from "../src/canary-controller.js";
import { CanaryRollbackError } from "../src/types.js";

describe("RuntimeCanaryController", () => {
  it("routes 100% to TypeScript when canary is disabled (0%)", () => {
    const controller = new RuntimeCanaryController({ canaryPercentage: 0 });
    const res1 = controller.resolveRuntimeTarget({ organizationId: "org_123" });
    const res2 = controller.resolveRuntimeTarget({ organizationId: "org_456" });

    expect(res1.target).toBe("typescript");
    expect(res1.isCanary).toBe(false);
    expect(res2.target).toBe("typescript");
  });

  it("routes consistently based on deterministic organization hashing during canary", () => {
    const controller = new RuntimeCanaryController({
      target: "go_runtime",
      canaryPercentage: 50,
      stage: "6_canary_50pct",
    });

    const decisionA1 = controller.resolveRuntimeTarget({
      organizationId: "org_alpha",
    });
    const decisionA2 = controller.resolveRuntimeTarget({
      organizationId: "org_alpha",
    });
    expect(decisionA1.target).toBe(decisionA2.target);
  });

  it("triggers automated rollback when error rate spikes", () => {
    const controller = new RuntimeCanaryController({
      target: "go_runtime",
      canaryPercentage: 20,
      rollbackOnErrorSpike: true,
      errorThresholdRatio: 0.1, // 10%
    });

    // Record 18 successes
    for (let i = 0; i < 18; i++) {
      controller.recordExecution(false);
    }

    // Record 5 errors to cross the threshold at total >= 20
    controller.recordExecution(true);
    controller.recordExecution(true);

    expect(() => {
      controller.recordExecution(true);
    }).toThrow(CanaryRollbackError);

    expect(controller.getPolicy().status).toBe("rolling_back");
    expect(controller.getPolicy().canaryPercentage).toBe(0);
  });
});
