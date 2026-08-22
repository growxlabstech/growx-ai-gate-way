import { describe, it, expect, beforeEach } from "vitest";
import {
  ReliabilityControlPlane,
  DependencyRegistry,
  CriticalInvariantVerifier,
  RestoreDrillRunner,
  PlatformReconciliationOrchestrator,
  PlatformIncidentManager,
} from "@growx/reliability";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Reliability Control Plane & Disaster Recovery (Phase 36)", () => {
  let fixture: TestGatewayFixture;
  let controlPlane: ReliabilityControlPlane;
  let registry: DependencyRegistry;
  let invariantVerifier: CriticalInvariantVerifier;
  let restoreRunner: RestoreDrillRunner;
  let reconciler: PlatformReconciliationOrchestrator;
  let incidentManager: PlatformIncidentManager;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    controlPlane = new ReliabilityControlPlane();
    registry = new DependencyRegistry();
    invariantVerifier = new CriticalInvariantVerifier();
    restoreRunner = new RestoreDrillRunner();
    reconciler = new PlatformReconciliationOrchestrator();
    incidentManager = new PlatformIncidentManager();
  });

  it("reports liveness, readiness, and granular capability readiness in NORMAL mode", () => {
    expect(controlPlane.isHealthy()).toBe(true);
    expect(controlPlane.isReady()).toBe(true);

    const caps = controlPlane.getCapabilityReadiness();
    expect(caps.textInferenceReady).toBe(true);
    expect(caps.fileInferenceReady).toBe(true);
    expect(caps.batchReady).toBe(true);
    expect(caps.billingReady).toBe(true);
    expect(caps.operationalMode).toBe("NORMAL");
  });

  it("isolates optional dependency failure so text inference remains available", () => {
    // Simulate Object Storage outage by disabling file & multimodal capabilities
    controlPlane.setCapability("fileInference", false);
    controlPlane.setCapability("multimodal", false);

    const caps = controlPlane.getCapabilityReadiness();
    expect(caps.fileInferenceReady).toBe(false);
    expect(caps.multimodalReady).toBe(false);
    expect(caps.textInferenceReady).toBe(true);
    expect(controlPlane.isReady()).toBe(true); // Global text inference still ready
  });

  it("enforces READ_ONLY and MAINTENANCE degraded modes correctly", () => {
    // 1. READ_ONLY
    controlPlane.setMode("READ_ONLY");
    expect(controlPlane.getMode()).toBe("READ_ONLY");
    expect(controlPlane.getCapabilityReadiness().batchReady).toBe(false);
    expect(controlPlane.getCapabilityReadiness().textInferenceReady).toBe(true);

    // 2. MAINTENANCE
    controlPlane.setMode("MAINTENANCE");
    expect(controlPlane.isHealthy()).toBe(false);
    expect(controlPlane.isReady()).toBe(false);
    expect(controlPlane.getCapabilityReadiness().textInferenceReady).toBe(
      false,
    );
  });

  it("executes an isolated database restore drill with measured RPO/RTO and invariant verification", async () => {
    const drill = await restoreRunner.executeDrill({
      type: "db_restore_drill",
      scope: "postgres_primary_snapshot",
      operatorId: "usr_ops_lead",
      simulatedDurationMs: 1200,
      simulatedRpoSeconds: 15,
      stateSnapshot: {
        walletBalances: [
          { accountId: "w_test_1", balance: "250.00", ledgerSum: "250.00" },
          { accountId: "w_test_2", balance: "1000.00", ledgerSum: "1000.00" },
        ],
        apiKeys: [
          { id: "key_live", secretHashPresent: true, orgId: "org_live" },
        ],
        providerCredentials: [{ accountId: "acc_live", activeVersionCount: 1 }],
        batches: [
          {
            id: "bat_done",
            totalItems: 50,
            processedItems: 50,
            isTerminal: true,
          },
        ],
        deletedResources: [
          { id: "res_deleted", isDeleted: true, stillAccessible: false },
        ],
      },
    });

    expect(drill.status).toBe("passed");
    expect(drill.observedRpoSeconds).toBe(15);
    expect(drill.observedRtoSeconds).toBe(1.2);
    expect(drill.invariants.length).toBe(5);
    expect(drill.invariants.every((i) => i.status === "passed")).toBe(true);
  });

  it("coordinates multi-domain state reconciliation after an operational incident", async () => {
    const inc = incidentManager.createIncident({
      severity: "SEV1",
      scope: "redis",
      summary: "Redis node failover and cache cold rebuild",
    });
    expect(inc.status).toBe("investigating");

    const report = await reconciler.reconcileAll([
      {
        name: "wallet_settlements",
        reconcile: async () => ({ evaluated: 100, reconciled: 0 }),
      },
      {
        name: "pending_batches",
        reconcile: async () => ({ evaluated: 10, reconciled: 0 }),
      },
      {
        name: "outbox_events",
        reconcile: async () => ({ evaluated: 45, reconciled: 2 }),
      },
    ]);

    expect(report.overallStatus).toBe("COMPLETED");
    expect(report.domainResults.length).toBe(3);

    const resolvedInc = incidentManager.updateStatus(
      inc.id,
      "resolved",
      "Reconciliation completed with 0 errors",
    );
    expect(resolvedInc.status).toBe("resolved");
    expect(resolvedInc.resolvedAt).toBeDefined();
  });
});
