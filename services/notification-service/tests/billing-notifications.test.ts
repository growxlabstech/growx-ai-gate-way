import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";

describe("Phase 23 — Billing & Financial Notifications", () => {
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

  it("fans out credit.low to both email and in_app channels", async () => {
    const result = await deliveryService.ingestAndFanout({
      id: "evt_cred_low_1",
      type: "credit.low.v1",
      organizationId: "org_billing_1",
      data: {
        remainingCredits: "25.50",
        email: "finance@org1.com",
        userId: "usr_fin_1",
      },
    });

    expect(result.deliveries.length).toBe(1);
    expect(result.inAppNotifications.length).toBe(1);

    expect(result.deliveries[0]!.channel).toBe("email");
    expect(result.inAppNotifications[0]!.title).toBe(
      "Credit balance running low",
    );

    const batch = await deliveryService.processBatch({ batchSize: 5 });
    expect(batch.delivered).toBe(1);
  });

  it("handles payment.failed as mandatory high-priority alert", async () => {
    const result = await deliveryService.ingestAndFanout({
      id: "evt_pay_fail_1",
      type: "payment.failed.v1",
      organizationId: "org_billing_1",
      data: {
        amount: "99.00",
        currency: "USD",
        email: "billing@org1.com",
        userId: "usr_fin_1",
      },
    });

    expect(result.intent.priority).toBe("high");
    expect(result.intent.preferenceMode).toBe("mandatory");
    expect(result.deliveries.length).toBe(1);
    expect(result.inAppNotifications.length).toBe(1);
  });
});
