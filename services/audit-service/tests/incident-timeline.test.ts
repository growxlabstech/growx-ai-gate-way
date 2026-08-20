import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";
import { SecurityService } from "../src/application/security-service.js";

describe("Phase 22 — Incident Timeline Investigation", () => {
  let repository: InMemoryAuditRepository;
  let auditService: AuditService;
  let securityService: SecurityService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    auditService = new AuditService(repository);
    securityService = new SecurityService(repository);
  });

  it("builds a unified chronological investigation timeline without exposing customer prompts", async () => {
    const t0 = 1700000000000;

    // 1. Audit event: User logged in
    await auditService.record({
      organizationId: "org_investigate",
      actorType: "user",
      actorId: "usr_alice",
      action: "auth.sign_in",
      resourceType: "user",
      sourceService: "auth-service",
      requestId: "req_auth_1",
      occurredAt: new Date(t0),
    });

    // 2. Audit event: API key created
    await auditService.record({
      organizationId: "org_investigate",
      actorType: "user",
      actorId: "usr_alice",
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: "key_investigate_1",
      sourceService: "api-key-service",
      requestId: "req_create_key",
      occurredAt: new Date(t0 + 10_000),
    });

    // 3. Security event: SSRF attempt using that API key
    await securityService.recordSecurityEvent({
      organizationId: "org_investigate",
      category: "network",
      type: "webhook.ssrf_attempt",
      severity: "high",
      sourceService: "webhook-service",
      actorId: "key_investigate_1",
      requestId: "req_webhook_attack",
      evidence: { attemptedHost: "169.254.169.254" },
      occurredAt: new Date(t0 + 20_000),
    });

    const timeline = await securityService.buildIncidentTimeline({
      organizationId: "org_investigate",
    });

    expect(timeline.length).toBe(3);
    expect(timeline[0].kind).toBe("audit");
    expect(timeline[0].actionOrType).toBe("auth.sign_in");
    expect(timeline[1].kind).toBe("audit");
    expect(timeline[1].actionOrType).toBe("api_key.created");
    expect(timeline[2].kind).toBe("security");
    expect(timeline[2].actionOrType).toBe("webhook.ssrf_attempt");
    expect(timeline[2].severity).toBe("high");
  });
});
