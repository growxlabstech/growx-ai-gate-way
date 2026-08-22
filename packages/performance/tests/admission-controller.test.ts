import { describe, it, expect, beforeEach } from "vitest";
import { AdmissionController } from "../src/admission-controller.js";

describe("AdmissionController", () => {
  let controller: AdmissionController;

  beforeEach(() => {
    controller = new AdmissionController({
      maxGlobalConcurrency: 10,
      maxTenantConcurrency: 3,
      overloadThresholdRatio: 0.8, // 80% threshold = 8 active requests
    });
  });

  it("allows requests within normal tenant and global limits", () => {
    const decision = controller.evaluateAdmission({ organizationId: "org_1" });
    expect(decision.allowed).toBe(true);
    controller.acquire("org_1");

    expect(controller.getActiveCounts().global).toBe(1);
    expect(controller.getActiveCounts().tenants["org_1"]).toBe(1);
  });

  it("throttles noisy tenant when tenant concurrency limit is exceeded", () => {
    controller.acquire("org_noisy");
    controller.acquire("org_noisy");
    controller.acquire("org_noisy"); // At limit of 3

    const decision = controller.evaluateAdmission({
      organizationId: "org_noisy",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Tenant concurrency limit");

    // Normal tenant can still be admitted
    const normalDecision = controller.evaluateAdmission({
      organizationId: "org_normal",
    });
    expect(normalDecision.allowed).toBe(true);
  });

  it("sheds low-priority BATCH requests when utilization crosses threshold", () => {
    // Fill 8 global slots (80% of 10)
    for (let i = 0; i < 8; i++) {
      controller.acquire(`org_${i}`);
    }

    // Standard/Critical request is still allowed
    const standardDec = controller.evaluateAdmission({
      organizationId: "org_std",
      priority: "STANDARD",
    });
    expect(standardDec.allowed).toBe(true);

    // Batch request is shed
    const batchDec = controller.evaluateAdmission({
      organizationId: "org_batch",
      priority: "BATCH",
    });
    expect(batchDec.allowed).toBe(false);
    expect(batchDec.reason).toContain("Load shedding");
  });
});
