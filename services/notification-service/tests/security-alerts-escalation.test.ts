import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";
import { EscalationService } from "../src/application/escalation-service.js";

describe("Phase 23 — Security Alerts & Escalation", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;
  let escalationService: EscalationService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter();
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
    escalationService = new EscalationService(repository, deliveryService);
  });

  it("creates critical security alert with scheduled escalation", async () => {
    const result = await deliveryService.ingestAndFanout(
      {
        id: "evt_sec_sig_1",
        type: "security.alert",
        organizationId: "org_sec_alert",
        data: {
          signalId: "sig_critical_1",
          title: "Cross-Tenant Access Attempt Detected",
          description: "Multiple attempts to access victim tenant resources",
          email: "secops@org.com",
          userId: "usr_sec_1",
        },
      }
    );

    expect(result.intent.priority).toBe("critical");
    expect(result.intent.preferenceMode).toBe("mandatory");

    // Escalation state created
    const escalations = Array.from(repository.escalations.values());
    expect(escalations.length).toBe(1);
    expect(escalations[0]!.status).toBe("pending");
    expect(escalations[0]!.signalId).toBe("sig_critical_1");

    // Advance time past escalation delay (15 mins)
    const future = new Date(Date.now() + 20 * 60 * 1000);
    const escalatedCount = await escalationService.processDueEscalations(future);
    expect(escalatedCount).toBe(1);

    // Verify secondary notification was created
    const allDeliveries = Array.from(repository.deliveries.values());
    expect(allDeliveries.length).toBe(2);
    expect(allDeliveries[1]!.recipientSnapshot).toContain("security-escalations");
  });

  it("cancels escalation when the underlying security signal is acknowledged/resolved", async () => {
    await deliveryService.ingestAndFanout(
      {
        id: "evt_sec_sig_2",
        type: "security.alert",
        organizationId: "org_sec_alert",
        data: {
          signalId: "sig_critical_2",
          title: "SSRF Attempt",
          description: "Attempted to reach 169.254.169.254",
          email: "secops@org.com",
        },
      }
    );

    const future = new Date(Date.now() + 20 * 60 * 1000);

    // Mock signal status returning "acknowledged" from Phase 22 Security Operations
    const mockChecker = async (id: string) => (id === "sig_critical_2" ? "acknowledged" : "new");

    const count = await escalationService.processDueEscalations(future, mockChecker);
    expect(count).toBe(0);

    const escalations = Array.from(repository.escalations.values());
    const esc = escalations.find((e) => e.signalId === "sig_critical_2");
    expect(esc?.status).toBe("cancelled");
  });
});
