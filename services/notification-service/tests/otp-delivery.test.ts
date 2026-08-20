import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";

describe("Phase 23 — OTP Delivery & Expiration Safety", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter(); // dev mode
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
  });

  it("fans out high-priority email delivery for auth.otp.v1 and completes delivery", async () => {
    const result = await deliveryService.ingestAndFanout(
      {
        id: "evt_otp_1",
        type: "auth.otp.v1",
        data: {
          otp: "654321",
          expiresInMinutes: 10,
          recipientEmail: "user@example.com",
        },
      }
    );

    expect(result.intent.priority).toBe("high");
    expect(result.intent.preferenceMode).toBe("mandatory");
    expect(result.deliveries.length).toBe(1);
    expect(result.deliveries[0]!.recipientSnapshot).toBe("user@example.com");

    const batchOutcome = await deliveryService.processBatch({ batchSize: 5 });
    expect(batchOutcome.delivered).toBe(1);

    const updated = await repository.getDelivery(result.deliveries[0]!.id);
    expect(updated!.status).toBe("delivered");
  });

  it("marks delivery expired and skips sending if OTP validity has expired", async () => {
    const expiredTime = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago in past (exceeding 10m TTL)

    const result = await deliveryService.ingestAndFanout(
      {
        id: "evt_otp_expired",
        type: "auth.otp.v1",
        data: {
          otp: "999999",
          expiresInMinutes: 0,
          recipientEmail: "late@example.com",
        },
        createdAt: expiredTime,
      }
    );

    const outcome = await deliveryService.processBatch({ batchSize: 5 });
    expect(outcome.delivered).toBe(0);
    expect(outcome.failed).toBe(1);

    const updated = await repository.getDelivery(result.deliveries[0]!.id);
    expect(updated!.status).toBe("expired");
  });

  it("forbids replaying OTP notifications", async () => {
    const result = await deliveryService.ingestAndFanout(
      {
        id: "evt_otp_replay",
        type: "auth.otp.v1",
        data: {
          otp: "111222",
          expiresInMinutes: 10,
          recipientEmail: "replay@example.com",
        },
      }
    );

    await expect(
      deliveryService.replayDelivery(result.deliveries[0]!.id)
    ).rejects.toThrow("Expired or completed OTP notifications cannot be replayed");
  });
});
