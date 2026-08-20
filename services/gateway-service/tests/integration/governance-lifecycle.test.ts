import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryGovernanceRepository,
  GovernancePolicyResolver,
  GovernanceDeletionOrchestrator,
  DataExportManager,
  RetentionScheduler,
  MockDomainDeletionProcessor,
} from "@growx/governance";
import { HardConstraintFilter } from "@growx/routing";
import type { DataResource, RetentionHold, RequestCapabilityProfile } from "@growx/contracts";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Data Governance & Privacy Lifecycle (Phase 35)", () => {
  let fixture: TestGatewayFixture;
  let repo: InMemoryGovernanceRepository;
  let policyResolver: GovernancePolicyResolver;
  let deletionOrchestrator: GovernanceDeletionOrchestrator;
  let exportManager: DataExportManager;
  let retentionScheduler: RetentionScheduler;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    repo = new InMemoryGovernanceRepository();
    policyResolver = new GovernancePolicyResolver(repo);
    deletionOrchestrator = new GovernanceDeletionOrchestrator(repo);
    deletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("postgres"));
    deletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("object_storage"));
    deletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("vector_store"));

    exportManager = new DataExportManager(repo);
    retentionScheduler = new RetentionScheduler(repo, deletionOrchestrator);
  });

  it("orchestrates customer data export packaging with valid download URL and expiration", async () => {
    const res: DataResource = {
      id: "dres_int_test",
      organizationId: "org_gov_int",
      resourceType: "prompt",
      resourceId: "req_int_123",
      dataClass: "CUSTOMER_CONTENT",
      dataCategory: "prompt",
      region: "GLOBAL",
      createdAt: new Date(),
    };
    await repo.registerResource(res);

    await repo.createExportRequest({
      id: "exp_int_1",
      organizationId: "org_gov_int",
      requestedBy: "key_admin_123",
      status: "requested",
      createdAt: new Date(),
    });

    const exportResult = await exportManager.processExport("exp_int_1");
    expect(exportResult.status).toBe("completed");
    expect(exportResult.outputFileId).toBeDefined();
    expect(exportResult.downloadUrl).toContain("exports.growx.internal/org_gov_int");
    expect(exportResult.expiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("orchestrates verified multi-processor deletion and generates evidence", async () => {
    await repo.createDeletionRequest({
      id: "dreq_int_1",
      organizationId: "org_gov_int",
      requestedBy: "key_admin_123",
      scope: "organization",
      status: "QUEUED",
      createdAt: new Date(),
    });

    const completed = await deletionOrchestrator.executeDeletion("dreq_int_1");
    expect(completed.status).toBe("COMPLETED");

    const evidenceList = await repo.listEvidence("dreq_int_1");
    expect(evidenceList.length).toBe(3);
    for (const ev of evidenceList) {
      expect(ev.outcome).toBe("PURGED");
      expect(ev.verificationMethod).toBe("processor_absence_check");
    }
  });

  it("blocks deletion when legal retention hold is active", async () => {
    const hold: RetentionHold = {
      id: "hold_gov_int",
      organizationId: "org_held_int",
      scope: "organization",
      reasonCode: "LEGAL_HOLD_COMPLIANCE_AUDIT",
      createdBy: "compliance_officer",
      startsAt: new Date(),
      status: "active",
    };
    await repo.createHold(hold);

    await repo.createDeletionRequest({
      id: "dreq_held_int",
      organizationId: "org_held_int",
      requestedBy: "key_admin_123",
      scope: "organization",
      status: "QUEUED",
      createdAt: new Date(),
    });

    const result = await deletionOrchestrator.executeDeletion("dreq_held_int");
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("LEGAL_HOLD_COMPLIANCE_AUDIT");
  });

  it("enforces data residency, training prohibition, and zero-retention as Router V2 hard constraints", () => {
    const candidates = [
      {
        routeId: "rt_eu_compliant",
        modelId: "m_gpt4o",
        providerId: "openai",
        region: "eu-central-1",
        accountStatus: "active",
        credentialStatus: "active",
        routeStatus: "active",
        providerStatus: "active",
        routingEligible: true,
        hasActiveCredential: true,
        circuit: "CLOSED",
        dataPolicy: {
          trainingBehavior: "prohibited",
          zeroRetentionCapability: true,
        },
      } as any,
      {
        routeId: "rt_us_non_compliant",
        modelId: "m_gpt4o",
        providerId: "openai",
        region: "us-east-1",
        accountStatus: "active",
        credentialStatus: "active",
        routeStatus: "active",
        providerStatus: "active",
        routingEligible: true,
        hasActiveCredential: true,
        circuit: "CLOSED",
        dataPolicy: {
          trainingBehavior: "permitted",
          zeroRetentionCapability: false,
        },
      } as any,
    ];

    // 1. Strict EU residency check
    const profileEU: RequestCapabilityProfile = {
      canonicalModelId: "openai/gpt-4o",
      inputModalities: ["text"],
      outputModalities: ["text"],
      requiredDataRegion: "EU",
    } as any;

    const resEU = HardConstraintFilter.filterCandidates(candidates, profileEU);
    expect(resEU.eligible.length).toBe(1);
    expect(resEU.eligible[0]!.routeId).toBe("rt_eu_compliant");
    expect(resEU.rejected[0]!.rejectionReason).toBe("DATA_RESIDENCY_MISMATCH");

    // 2. Training prohibition check
    const profileTraining: RequestCapabilityProfile = {
      canonicalModelId: "openai/gpt-4o",
      inputModalities: ["text"],
      outputModalities: ["text"],
      prohibitProviderTraining: true,
    } as any;

    const resTraining = HardConstraintFilter.filterCandidates(candidates, profileTraining);
    expect(resTraining.eligible.length).toBe(1);
    expect(resTraining.eligible[0]!.routeId).toBe("rt_eu_compliant");
    expect(resTraining.rejected[0]!.rejectionReason).toBe("PROVIDER_TRAINING_PROHIBITED");

    // 3. Zero-retention capability check
    const profileZeroRet: RequestCapabilityProfile = {
      canonicalModelId: "openai/gpt-4o",
      inputModalities: ["text"],
      outputModalities: ["text"],
      zeroRetentionRequired: true,
    } as any;

    const resZeroRet = HardConstraintFilter.filterCandidates(candidates, profileZeroRet);
    expect(resZeroRet.eligible.length).toBe(1);
    expect(resZeroRet.eligible[0]!.routeId).toBe("rt_eu_compliant");
    expect(resZeroRet.rejected[0]!.rejectionReason).toBe("ZERO_RETENTION_NOT_SUPPORTED");
  });
});
