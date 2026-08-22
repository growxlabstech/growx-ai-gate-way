import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";

describe("Phase 22 — Multi-Tenant Chain Isolation", () => {
  let repository: InMemoryAuditRepository;
  let auditService: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    auditService = new AuditService(repository);
  });

  it("maintains isolated independent chains for different organizations", async () => {
    // Org A events
    const orgAEvent1 = await auditService.record({
      organizationId: "org_a",
      actorType: "user",
      actorId: "usr_a",
      action: "auth.sign_in",
      resourceType: "user",
      sourceService: "auth-service",
    });
    expect(orgAEvent1.sequence).toBe(1);
    expect(orgAEvent1.chainScope).toBe("org:org_a");

    // Org B events
    const orgBEvent1 = await auditService.record({
      organizationId: "org_b",
      actorType: "user",
      actorId: "usr_b",
      action: "auth.sign_in",
      resourceType: "user",
      sourceService: "auth-service",
    });
    expect(orgBEvent1.sequence).toBe(1);
    expect(orgBEvent1.chainScope).toBe("org:org_b");

    // Org A cannot list Org B's events
    const orgAList = await auditService.listCustomerAuditEvents("org_a", {});
    expect(orgAList.length).toBe(1);
    expect(orgAList[0]!.id).toBe(orgAEvent1.id);

    const orgBReadFromA = await auditService.getCustomerAuditEvent(
      "org_a",
      orgBEvent1.id,
    );
    expect(orgBReadFromA).toBeUndefined();
  });
});
