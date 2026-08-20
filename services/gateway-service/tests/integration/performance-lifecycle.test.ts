import { describe, it, expect, beforeEach } from "vitest";
import {
  AdmissionController,
  BenchmarkHarness,
  PlatformProfiler,
  InfrastructureCostModeler,
  LanguageMigrationDecisionEngine,
} from "@growx/performance";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Platform Performance & Scale Engineering Lifecycle (Phase 37)", () => {
  let fixture: TestGatewayFixture;
  let admissionController: AdmissionController;
  let benchmarkHarness: BenchmarkHarness;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    admissionController = new AdmissionController({
      maxGlobalConcurrency: 20,
      maxTenantConcurrency: 5,
      overloadThresholdRatio: 0.75, // 75% threshold = 15 requests
    });
    benchmarkHarness = new BenchmarkHarness();
  });

  it("enforces tenant fairness and prevents noisy-neighbor resource exhaustion", () => {
    const tenantA = "org_noisy_neighbor";
    const tenantB = "org_normal_user";

    // Tenant A consumes its max concurrency allocation (5 slots)
    for (let i = 0; i < 5; i++) {
      const decision = admissionController.evaluateAdmission({ organizationId: tenantA });
      expect(decision.allowed).toBe(true);
      admissionController.acquire(tenantA);
    }

    // 6th request from Tenant A is throttled with retry-after header metadata
    const blockedDecisionA = admissionController.evaluateAdmission({ organizationId: tenantA });
    expect(blockedDecisionA.allowed).toBe(false);
    expect(blockedDecisionA.retryAfterMs).toBeGreaterThan(0);
    expect(blockedDecisionA.reason).toContain("Tenant concurrency limit");

    // Tenant B can still be admitted without interference
    const decisionB = admissionController.evaluateAdmission({ organizationId: tenantB });
    expect(decisionB.allowed).toBe(true);
  });

  it("sheds low-priority batch requests when platform utilization is elevated", () => {
    // Elevate global concurrency to 16 slots (>= 75% of 20)
    for (let i = 0; i < 16; i++) {
      admissionController.acquire(`org_tenant_${i}`);
    }

    // Standard/Realtime traffic remains admitted
    const realtimeDecision = admissionController.evaluateAdmission({
      organizationId: "org_realtime",
      priority: "STANDARD",
    });
    expect(realtimeDecision.allowed).toBe(true);

    // Batch work is shed to protect realtime inference
    const batchDecision = admissionController.evaluateAdmission({
      organizationId: "org_batch_job",
      priority: "BATCH",
    });
    expect(batchDecision.allowed).toBe(false);
    expect(batchDecision.reason).toContain("Load shedding");
  });

  it("executes deterministic benchmark scenario with separated GrowX overhead and provider latency", async () => {
    const run = await benchmarkHarness.runScenario({
      scenario: "smoke_1k",
      totalRequests: 25,
      concurrency: 5,
      simulatedProviderLatencyMs: 20,
      growxOverheadTargetMs: 4,
    });

    expect(run.id).toBeDefined();
    expect(run.scenario).toBe("smoke_1k");
    expect(run.metrics.requestCount).toBe(25);
    expect(run.metrics.rps).toBeGreaterThan(0);
    expect(run.metrics.p50Ms).toBeGreaterThan(0);
    expect(run.metrics.p95Ms).toBeGreaterThan(0);
    expect(run.metrics.growxOverheadP95Ms).toBeGreaterThan(0);
    expect(run.metrics.growxOverheadP95Ms).toBeLessThan(run.metrics.p95Ms); // Overhead is fraction of total
    expect(run.verdict).toBe("PASSED");
  });

  it("generates evidence-based Language Migration Report across all platform services", () => {
    const evaluations = LanguageMigrationDecisionEngine.evaluateAllServices();
    expect(evaluations.length).toBeGreaterThanOrEqual(6);

    const gateway = evaluations.find((e) => e.serviceName.includes("Gateway"));
    expect(gateway).toBeDefined();
    expect(gateway?.decision).toBe("KEEP_TYPESCRIPT");
    expect(gateway?.workloadType).toBe("io_bound");

    const costBreakdown = InfrastructureCostModeler.calculateCostPerMillion();
    expect(costBreakdown.totalPlatformCostUsdPerMillion).toBeGreaterThan(0);
    expect(costBreakdown.unitCostUsdPerRequest).toBeGreaterThan(0);
  });
});
