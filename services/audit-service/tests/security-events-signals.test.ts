import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { SecurityService } from "../src/application/security-service.js";

describe("Phase 22 — Security Events & Signal Correlation", () => {
  let repository: InMemoryAuditRepository;
  let securityService: SecurityService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    securityService = new SecurityService(repository);
  });

  it("normalizes security events from across domains and correlates them into SecuritySignals", async () => {
    // 1. Webhook SSRF attempt (threshold 1 -> High)
    const { securityEvent: ssrfEvent, signal: ssrfSignal } =
      await securityService.recordSecurityEvent({
        organizationId: "org_sec_test",
        category: "network",
        type: "webhook.ssrf_attempt",
        severity: "high",
        sourceService: "webhook-service",
        evidence: { url: "http://169.254.169.254/latest/meta-data" },
      });

    expect(ssrfEvent.id).toMatch(/^sec_/);
    expect(ssrfSignal).toBeDefined();
    expect(ssrfSignal!.severity).toBe("high");
    expect(ssrfSignal!.count).toBe(1);

    // 2. Cross-tenant access attempt
    const { securityEvent: crossTenantEvent, signal: crossTenantSignal } =
      await securityService.recordSecurityEvent({
        organizationId: "org_sec_test",
        category: "tenant_isolation",
        type: "tenancy.cross_tenant_access",
        severity: "high",
        sourceService: "gateway-service",
        actorId: "usr_attacker",
        evidence: { targetTenant: "org_victim" },
      });

    expect(crossTenantEvent.id).toBeDefined();
    expect(crossTenantSignal).toBeDefined();
    expect(crossTenantSignal!.count).toBe(1);

    // 3. Update signal operational status without mutating raw security event
    const updated = await securityService.updateSignalStatus(
      ssrfSignal!.id,
      "investigating"
    );
    expect(updated.status).toBe("investigating");

    const rawEvent = await repository.getSecurityEvent(ssrfEvent.id);
    expect(rawEvent).toBeDefined();
    expect(rawEvent!.id).toBe(ssrfEvent.id);
  });
});
