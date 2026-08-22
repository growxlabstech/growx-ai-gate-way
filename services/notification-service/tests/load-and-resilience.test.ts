import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";
import type {
  EmailDeliveryResult,
  EmailProviderAdapter,
  SendEmailParams,
} from "../src/infrastructure/resend-adapter.js";

describe("Phase 23 — Notification Load, Concurrency & Provider Outage Tests", () => {
  let repository: InMemoryNotificationRepository;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
  });

  it("handles high volume ingestion and batch claiming without losing messages", async () => {
    const emailAdapter: EmailProviderAdapter = {
      sendEmail: async () => ({
        providerStatus: 200,
        providerMessageId: "msg_ok",
      }),
    };
    const deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });

    // Ingest 100 notifications across 10 organizations
    for (let i = 0; i < 100; i++) {
      await deliveryService.ingestAndFanout({
        id: `evt_load_${i}`,
        type: "credit.low.v1",
        organizationId: `org_${i % 10}`,
        data: {
          remainingCredits: "50",
          email: `user_${i}@org.com`,
          userId: `usr_${i}`,
        },
      });
    }

    expect(repository.intents.size).toBe(100);
    expect(repository.deliveries.size).toBe(100);

    // Process in batches of 25
    let totalDelivered = 0;
    for (let b = 0; b < 4; b++) {
      const outcome = await deliveryService.processBatch({ batchSize: 25 });
      totalDelivered += outcome.delivered;
    }

    expect(totalDelivered).toBe(100);

    // Verify all 100 are marked delivered
    const all = await repository.listDeliveries({});
    const deliveredCount = all.filter((d) => d.status === "delivered").length;
    expect(deliveredCount).toBe(100);
  });

  it("prioritizes critical OTP jobs ahead of low-priority summaries in queue", async () => {
    const emailAdapter: EmailProviderAdapter = {
      sendEmail: async () => ({
        providerStatus: 200,
        providerMessageId: "msg_ok",
      }),
    };
    const deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });

    // 1. Ingest 5 normal-priority billing notifications
    for (let i = 0; i < 5; i++) {
      await deliveryService.ingestAndFanout({
        id: `evt_normal_${i}`,
        type: "subscription.updated.v1",
        data: { planName: "Pro", email: `normal_${i}@org.com` },
      });
    }

    // 2. Ingest 1 high-priority OTP notification AFTER the normal ones
    await deliveryService.ingestAndFanout({
      id: "evt_otp_urgent",
      type: "auth.otp.v1",
      data: {
        otp: "987654",
        expiresInMinutes: 10,
        recipientEmail: "urgent@org.com",
      },
    });

    // 3. Claim batch of 1
    const claimed = await repository.claimPendingDeliveries(
      1,
      30_000,
      "wrk_priority",
    );
    expect(claimed.length).toBe(1);
    expect(claimed[0]!.priority).toBe("high");
    expect(claimed[0]!.recipientSnapshot).toBe("urgent@org.com");
  });

  it("handles provider rate limits (429) gracefully by scheduling retries", async () => {
    let callCount = 0;
    const rateLimitedAdapter: EmailProviderAdapter = {
      sendEmail: async () => {
        callCount++;
        const err: any = new Error("Rate limit exceeded");
        err.status = 429;
        throw err;
      },
    };
    const deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter: rateLimitedAdapter,
    });

    await deliveryService.ingestAndFanout({
      id: "evt_rate_limit_1",
      type: "credit.low.v1",
      data: { remainingCredits: "10", email: "rl@example.com" },
    });

    const batch = await deliveryService.processBatch({ batchSize: 1 });
    expect(batch.delivered).toBe(0);
    expect(batch.retried).toBe(1);

    const delivery = Array.from(repository.deliveries.values())[0];
    expect(delivery!.status).toBe("retrying");
    expect(delivery!.attemptCount).toBe(1);
    expect(delivery!.nextAttemptAt).toBeDefined();
  });

  it("handles temporary 100% email provider outage without dropping deliveries", async () => {
    const downAdapter: EmailProviderAdapter = {
      sendEmail: async () => {
        const err: any = new Error("Service Unavailable");
        err.status = 503;
        throw err;
      },
    };
    const deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter: downAdapter,
    });

    await deliveryService.ingestAndFanout({
      id: "evt_outage_1",
      type: "credit.low.v1",
      data: { remainingCredits: "10", email: "outage@example.com" },
    });

    const batch = await deliveryService.processBatch({ batchSize: 1 });
    expect(batch.retried).toBe(1);

    const delivery = Array.from(repository.deliveries.values())[0];
    expect(delivery!.status).toBe("retrying");
    expect(delivery!.attemptCount).toBe(1);
  });
});
