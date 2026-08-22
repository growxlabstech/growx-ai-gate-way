import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";

describe("Phase 23 — Preferences & Mandatory Policy Enforcement", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter();
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
  });

  it("suppresses optional notifications when user has disabled them", async () => {
    // User disables billing email
    await repository.updatePreference({
      id: "pref_1",
      userId: "usr_opt_out",
      organizationId: "org_pref_test",
      category: "billing",
      channel: "email",
      enabled: false,
      updatedAt: new Date(),
    });

    // Ingest subscription.updated (optional)
    const result = await deliveryService.ingestAndFanout({
      id: "evt_sub_up_1",
      type: "subscription.updated.v1",
      organizationId: "org_pref_test",
      data: {
        planName: "Pro Tier",
        email: "user@example.com",
        userId: "usr_opt_out",
      },
    });

    // Email delivery was suppressed by preference; in-app still created
    expect(result.deliveries.length).toBe(0);
    expect(result.inAppNotifications.length).toBe(1);
  });

  it("never allows user preferences to suppress mandatory authentication or security alerts", async () => {
    // User attempts to disable authentication & security emails
    await repository.updatePreference({
      id: "pref_auth",
      userId: "usr_mandatory_test",
      category: "authentication",
      channel: "email",
      enabled: false,
      updatedAt: new Date(),
    });

    // Ingest auth.otp.v1 (mandatory)
    const result = await deliveryService.ingestAndFanout({
      id: "evt_otp_mand_1",
      type: "auth.otp.v1",
      data: {
        otp: "888999",
        expiresInMinutes: 10,
        recipientEmail: "user@example.com",
        userId: "usr_mandatory_test",
      },
    });

    // Delivery must be created regardless of user preference
    expect(result.deliveries.length).toBe(1);
    expect(result.deliveries[0]!.channel).toBe("email");
  });
});
