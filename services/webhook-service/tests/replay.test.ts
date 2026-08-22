import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";
import { WebhookReplayService } from "../src/application/webhook-replay-service.js";

describe("Phase 21 — Webhook Replay & Bulk Replay Jobs", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;
  let replayService: WebhookReplayService;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);
    replayService = new WebhookReplayService(repository);

    await endpointService.createEndpoint({
      organizationId: "org_rpl_test",
      url: "https://api.receiver.com/webhook",
      eventTypes: ["payment.*"],
    });
  });

  it("replays single delivery preserving stable event ID and creating new delivery ID", async () => {
    const { outboundEvent, deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_rpl_1",
      eventType: "payment.succeeded",
      organizationId: "org_rpl_test",
      data: { paymentId: "pay_rpl_1" },
    });

    const originalDelivery = deliveries[0];

    // Replay
    const newDelivery = await replayService.replayDelivery(
      "org_rpl_test",
      originalDelivery!.id,
    );

    expect(newDelivery.id).not.toBe(originalDelivery!.id); // New delivery ID
    expect(newDelivery.webhookEventId).toBe(outboundEvent.id); // Stable external event ID!
    expect(newDelivery.status).toBe("pending");
    expect(newDelivery.attemptCount).toBe(0);
  });

  it("executes bulk replay job across multiple historical events", async () => {
    for (let i = 1; i <= 5; i++) {
      await eventRouter.routeEvent({
        sourceEventId: `src_bulk_${i}`,
        eventType: "payment.succeeded",
        organizationId: "org_rpl_test",
        data: { paymentId: `pay_${i}` },
      });
    }

    const { job, createdDeliveriesCount } =
      await replayService.createBulkReplayJob({
        organizationId: "org_rpl_test",
        filterConfig: {
          eventTypes: ["payment.succeeded.v1"],
        },
      });

    expect(job.status).toBe("completed");
    expect(job.totalEvents).toBe(5);
    expect(job.replayedEvents).toBe(5);
    expect(createdDeliveriesCount).toBe(5);
  });
});
