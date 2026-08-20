import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";
import { WebhookDeliveryService } from "../src/application/webhook-delivery-service.js";

describe("Phase 21 — Load & Failure-Storm Resilience", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);

    // 5 endpoints subscribed to events
    for (let i = 1; i <= 5; i++) {
      await endpointService.createEndpoint({
        organizationId: `org_load_${i}`,
        url: `https://api.load${i}.com/webhook`,
        eventTypes: ["*.*"],
      });
    }
  });

  it("handles high throughput event routing without memory or state corruption", async () => {
    const routePromises = [];
    for (let i = 1; i <= 500; i++) {
      const orgId = `org_load_${(i % 5) + 1}`;
      routePromises.push(
        eventRouter.routeEvent({
          sourceEventId: `src_load_${i}`,
          eventType: "request.completed",
          organizationId: orgId,
          data: { requestId: `req_${i}`, model: "openai/gpt-4o" },
        })
      );
    }

    const results = await Promise.all(routePromises);
    expect(results.length).toBe(500);

    const allDeliveries = Array.from(repository.deliveries.values());
    expect(allDeliveries.length).toBe(500);
  });

  it("safely processes failure storm (all endpoints offline) with bounded retry queue", async () => {
    // 50 offline deliveries
    for (let i = 1; i <= 50; i++) {
      await eventRouter.routeEvent({
        sourceEventId: `src_storm_${i}`,
        eventType: "payment.succeeded",
        organizationId: "org_load_1",
        data: { paymentId: `pay_storm_${i}` },
      });
    }

    // Mock failing endpoint (503 Service Unavailable)
    const mockFetcher: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: "Down" }), { status: 503 });
    };

    const deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
      fetcher: mockFetcher,
    });

    const batchResult = await deliveryService.processBatch({ batchSize: 50 });
    expect(batchResult.delivered).toBe(0);
    expect(batchResult.retried).toBe(50);
    expect(batchResult.deadLettered).toBe(0);

    const retryingDeliveries = await repository.listDeliveries("org_load_1", {
      status: "retrying",
    });
    expect(retryingDeliveries.length).toBe(50);
    for (const d of retryingDeliveries) {
      expect(d.attemptCount).toBe(1);
      expect(d.nextAttemptAt).toBeDefined();
    }
  });
});
