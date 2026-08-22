import { describe, it, expect, beforeEach } from "vitest";
import { ReliabilityControlPlane } from "../src/control-plane.js";
import { CapabilityDisabledError } from "../src/types.js";

describe("ReliabilityControlPlane", () => {
  let cp: ReliabilityControlPlane;

  beforeEach(() => {
    cp = new ReliabilityControlPlane();
  });

  it("initializes in NORMAL mode with all capabilities and kill switches enabled", () => {
    expect(cp.getMode()).toBe("NORMAL");
    expect(cp.isHealthy()).toBe(true);
    expect(cp.isReady()).toBe(true);

    const readiness = cp.getCapabilityReadiness();
    expect(readiness.textInferenceReady).toBe(true);
    expect(readiness.batchReady).toBe(true);
    expect(readiness.billingReady).toBe(true);
  });

  it("transitions to READ_ONLY mode and disables write/batch capabilities", () => {
    cp.setMode("READ_ONLY");
    expect(cp.getMode()).toBe("READ_ONLY");

    const readiness = cp.getCapabilityReadiness();
    expect(readiness.textInferenceReady).toBe(true);
    expect(readiness.batchReady).toBe(false);

    expect(() => cp.checkCapability("batch")).toThrow(CapabilityDisabledError);
    expect(() => cp.checkCapability("textInference")).not.toThrow();
  });

  it("transitions to MAINTENANCE mode and reports unready", () => {
    cp.setMode("MAINTENANCE");
    expect(cp.isHealthy()).toBe(false);
    expect(cp.isReady()).toBe(false);

    expect(() => cp.checkCapability("textInference")).toThrow(
      CapabilityDisabledError,
    );
  });

  it("supports granular capability toggling and kill switches", () => {
    cp.setCapability("fileInference", false);
    const readiness = cp.getCapabilityReadiness();
    expect(readiness.textInferenceReady).toBe(true);
    expect(readiness.fileInferenceReady).toBe(false);

    cp.setKillSwitch("allowNewBatchSubmissions", false);
    expect(cp.getCapabilityReadiness().batchReady).toBe(false);
  });
});
