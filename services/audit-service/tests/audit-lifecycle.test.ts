import { describe, expect, it, beforeEach } from "vitest";
import { GENESIS_HASH } from "@growx/audit";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";

describe("Phase 22 — Audit Lifecycle & Tamper-Evident Chaining", () => {
  let repository: InMemoryAuditRepository;
  let auditService: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    auditService = new AuditService(repository);
  });

  it("appends audit events with strictly monotonic sequences and unbroken hash chaining", async () => {
    const event1 = await auditService.record({
      organizationId: "org_audit_1",
      actorType: "user",
      actorId: "usr_alice",
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: "key_1",
      sourceService: "api-key-service",
      metadata: { name: "Test Key" },
    });

    expect(event1.sequence).toBe(1);
    expect(event1.previousHash).toBe(GENESIS_HASH);
    expect(event1.eventHash).toBeDefined();

    const event2 = await auditService.record({
      organizationId: "org_audit_1",
      actorType: "user",
      actorId: "usr_alice",
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: "key_1",
      sourceService: "api-key-service",
      metadata: {},
    });

    expect(event2.sequence).toBe(2);
    expect(event2.previousHash).toBe(event1.eventHash);
    expect(event2.eventHash).toBeDefined();

    // Verify chain
    const verifyResult = await auditService.verifyChain("org:org_audit_1");
    expect(verifyResult.valid).toBe(true);
  });

  it("detects tampering when an event is corrupted in the store", async () => {
    for (let i = 1; i <= 5; i++) {
      await auditService.record({
        organizationId: "org_tamper_test",
        actorType: "user",
        actorId: "usr_bob",
        action: "wallet.adjustment_applied",
        resourceType: "wallet",
        resourceId: "wal_1",
        sourceService: "credit-service",
        metadata: { amount: i * 10 },
      });
    }

    // Tamper with sequence 3 in repository
    const events = await repository.listAuditEvents({
      chainScope: "org:org_tamper_test",
    });
    events[2]!.metadata = { amount: 999999 };

    const verifyResult = await auditService.verifyChain("org:org_tamper_test");
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.firstInvalidSequence).toBe(3);
  });

  it("creates and retrieves integrity checkpoints", async () => {
    await auditService.record({
      organizationId: "org_chk_test",
      actorType: "user",
      actorId: "usr_charlie",
      action: "policy.updated",
      resourceType: "policy",
      sourceService: "policy-service",
    });

    const checkpoint = await auditService.createCheckpoint("org:org_chk_test");
    expect(checkpoint).toBeDefined();
    expect(checkpoint!.lastSequence).toBe(1);
    expect(checkpoint!.lastEventHash).toBeDefined();

    const checkpoints = await repository.listCheckpoints("org:org_chk_test");
    expect(checkpoints.length).toBe(1);
  });
});
