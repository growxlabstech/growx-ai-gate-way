import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";

describe("Phase 23 — Queue Resilience, Worker Leases, and Crash Recovery", () => {
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

  it("handles multi-worker disjoint batch claiming using worker leases", async () => {
    // Ingest 5 events
    for (let i = 0; i < 5; i++) {
      await deliveryService.ingestAndFanout({
        id: `evt_batch_${i}`,
        type: "auth.otp.v1",
        data: {
          otp: `12345${i}`,
          expiresInMinutes: 10,
          recipientEmail: `batch_${i}@example.com`,
        },
      });
    }

    // Worker 1 claims 3
    const claimed1 = await repository.claimPendingDeliveries(3, 30_000, "wrk_1");
    expect(claimed1.length).toBe(3);
    for (const c of claimed1) {
      expect(c.leaseOwner).toBe("wrk_1");
    }

    // Worker 2 claims remaining 2
    const claimed2 = await repository.claimPendingDeliveries(3, 30_000, "wrk_2");
    expect(claimed2.length).toBe(2);
    for (const c of claimed2) {
      expect(c.leaseOwner).toBe("wrk_2");
    }

    // Worker 3 has nothing left to claim
    const claimed3 = await repository.claimPendingDeliveries(3, 30_000, "wrk_3");
    expect(claimed3.length).toBe(0);
  });

  it("recovers and re-claims jobs when worker lease expires after crash", async () => {
    await deliveryService.ingestAndFanout({
      id: "evt_crash_test",
      type: "auth.otp.v1",
      data: {
        otp: "123456",
        expiresInMinutes: 10,
        recipientEmail: "crash@example.com",
      },
    });

    // Worker 1 claims with very short lease (10ms) and crashes
    await repository.claimPendingDeliveries(1, 10, "wrk_crashed");

    // Wait for lease to expire
    await new Promise((r) => setTimeout(r, 20));

    // Worker 2 successfully recovers and claims the job
    const recovered = await repository.claimPendingDeliveries(1, 30_000, "wrk_recovered");
    expect(recovered.length).toBe(1);
    expect(recovered[0]!.leaseOwner).toBe("wrk_recovered");
  });

  it("suppresses deliveries to hard-bounced or complaint destinations", async () => {
    // Add suppression for bounce@example.com
    await repository.createSuppression({
      id: "supp_1",
      destination: "bounce@example.com",
      reason: "hard_bounce",
      source: "resend_webhook",
      createdAt: new Date(),
    });

    const result = await deliveryService.ingestAndFanout({
      id: "evt_bounce_test",
      type: "auth.otp.v1",
      data: {
        otp: "123456",
        expiresInMinutes: 10,
        recipientEmail: "bounce@example.com",
      },
    });

    await deliveryService.processBatch({ batchSize: 5 });

    const delivery = await repository.getDelivery(result.deliveries[0]!.id);
    expect(delivery!.status).toBe("suppressed");
  });
});
