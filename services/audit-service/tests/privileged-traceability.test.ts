import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";

describe("Phase 22 — Privileged & Break-Glass Traceability", () => {
  let repository: InMemoryAuditRepository;
  let auditService: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    auditService = new AuditService(repository);
  });

  it("records privileged operator actions with JIT session context and approval reference", async () => {
    const event = await auditService.recordPrivileged({
      sessionId: "jit_sess_123",
      operatorId: "op_dave",
      action: "provider.credential_rotated",
      resourceType: "provider_credential",
      resourceId: "cred_openai_1",
      reason: "Quarterly key rotation policy",
      approvalReference: "INC-88992",
      requestId: "req_ops_1",
    });

    expect(event.privileged).toBe(true);
    expect(event.jitSessionId).toBe("jit_sess_123");
    expect(event.actorType).toBe("operator");
    expect(event.actorId).toBe("op_dave");
    expect(event.metadata.approvalReference).toBe("INC-88992");
    expect(event.breakGlass).toBe(false);
  });

  it("explicitly marks and preserves emergency break-glass operations", async () => {
    const event = await auditService.recordPrivileged({
      sessionId: "jit_emergency_1",
      operatorId: "op_admin_root",
      action: "ops.break_glass_executed",
      resourceType: "system",
      reason: "Emergency circuit break override during provider total outage",
      requestId: "req_emergency_1",
      breakGlass: true,
    });

    expect(event.privileged).toBe(true);
    expect(event.breakGlass).toBe(true);
    expect(event.actorId).toBe("op_admin_root");
  });
});
