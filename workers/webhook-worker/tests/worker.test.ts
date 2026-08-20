import { describe, expect, it } from "vitest";
import {
  InMemoryWebhookRepository,
  WebhookDeliveryService,
  WebhookEndpointService,
  WebhookEventRouter,
} from "@growx/webhook-service";
import { WebhookWorker, workerName } from "../src/index.js";

describe("Phase 21 — Webhook Background Worker", () => {
  it("has an identity", () => {
    expect(workerName).toBe("webhook-worker");
  });

  it("processes deliveries in batch and stops gracefully", async () => {
    const repository = new InMemoryWebhookRepository();
    const endpointService = new WebhookEndpointService(repository);
    const eventRouter = new WebhookEventRouter(repository);

    await endpointService.createEndpoint({
      organizationId: "org_worker_test",
      url: "https://api.worker-receiver.com/webhook",
      eventTypes: ["*.*"],
    });

    await eventRouter.routeEvent({
      sourceEventId: "src_w_1",
      eventType: "payment.succeeded",
      organizationId: "org_worker_test",
      data: { paymentId: "pay_w_1" },
    });

    const mockFetcher: typeof fetch = async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
      fetcher: mockFetcher,
    });

    const worker = new WebhookWorker({
      deliveryService,
      pollIntervalMs: 50,
      batchSize: 10,
    });

    const result = await worker.runOnce();
    expect(result.delivered).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.deadLettered).toBe(0);

    // Verify delivery status updated in DB
    const deliveries = await repository.listDeliveries("org_worker_test");
    expect(deliveries[0].status).toBe("succeeded");

    // Test start and stop
    worker.start();
    worker.stop();
  });
});
