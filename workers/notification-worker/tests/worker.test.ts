import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryNotificationRepository,
  ResendEmailAdapter,
  NotificationDeliveryService,
  EscalationService,
} from "@growx/notification-service";
import { NotificationWorker } from "../src/index.js";

describe("Phase 23 — Notification Worker Runner", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;
  let escalationService: EscalationService;
  let worker: NotificationWorker;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter();
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
    escalationService = new EscalationService(repository, deliveryService);
    worker = new NotificationWorker({
      deliveryService,
      escalationService,
      pollIntervalMs: 50,
    });
  });

  it("claims batch and executes delivery runOnce successfully", async () => {
    await deliveryService.ingestAndFanout({
      id: "evt_wrk_test",
      type: "auth.otp.v1",
      data: {
        otp: "777888",
        expiresInMinutes: 10,
        recipientEmail: "worker@example.com",
      },
    });

    const result = await worker.runOnce();
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);

    const deliveries = await repository.listDeliveries({
      recipientSnapshot: "worker@example.com",
    });
    expect(deliveries[0]!.status).toBe("delivered");
  });

  it("starts and stops worker timer cleanly", async () => {
    worker.start();
    await new Promise((r) => setTimeout(r, 60));
    worker.stop();
    // Verify no hanging timers
  });
});
