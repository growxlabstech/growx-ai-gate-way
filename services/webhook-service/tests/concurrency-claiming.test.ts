import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";

describe("Phase 21 — Multi-Worker Claiming & Lease Expiry", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);

    await endpointService.createEndpoint({
      organizationId: "org_claim_test",
      url: "https://api.receiver.com/webhook",
      eventTypes: ["*.*"],
    });
  });

  it("ensures multiple concurrent workers claim disjoint delivery jobs with leases", async () => {
    // Create 10 deliveries
    for (let i = 1; i <= 10; i++) {
      await eventRouter.routeEvent({
        sourceEventId: `src_batch_${i}`,
        eventType: "payment.succeeded",
        organizationId: "org_claim_test",
        data: { paymentId: `pay_${i}` },
      });
    }

    // Worker 1 claims 5
    const worker1Claimed = await repository.claimPendingDeliveries(5, 30_000, "worker_1");
    expect(worker1Claimed.length).toBe(5);

    // Worker 2 claims next 5
    const worker2Claimed = await repository.claimPendingDeliveries(5, 30_000, "worker_2");
    expect(worker2Claimed.length).toBe(5);

    // Verify disjoint IDs
    const ids1 = new Set(worker1Claimed.map((d) => d.id));
    const ids2 = new Set(worker2Claimed.map((d) => d.id));
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }

    // Worker 3 finds 0 left
    const worker3Claimed = await repository.claimPendingDeliveries(5, 30_000, "worker_3");
    expect(worker3Claimed.length).toBe(0);
  });

  it("reclaims crashed worker deliveries after lease expiration", async () => {
    await eventRouter.routeEvent({
      sourceEventId: "src_crash_1",
      eventType: "payment.succeeded",
      organizationId: "org_claim_test",
      data: { paymentId: "pay_crash" },
    });

    // Claim with expired lease
    const claimed = await repository.claimPendingDeliveries(1, 100, "worker_crashed");
    expect(claimed.length).toBe(1);

    // Manually expire lease in past
    await repository.updateDelivery(claimed[0]!.id, {
      leaseExpiresAt: new Date(Date.now() - 1000),
    });

    // Recovery worker claims the abandoned job
    const recovered = await repository.claimPendingDeliveries(1, 30_000, "worker_recovery");
    expect(recovered.length).toBe(1);
    expect(recovered[0]!.id).toBe(claimed[0]!.id);
    expect(recovered[0]!.claimedBy).toBe("worker_recovery");
  });
});
