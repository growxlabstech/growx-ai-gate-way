import { describe, expect, it, beforeEach } from "vitest";
import { WEBHOOK_HEADERS, WebhookSerializer, verifyWebhookSignature } from "@growx/webhooks";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";
import { WebhookDeliveryService } from "../src/application/webhook-delivery-service.js";

describe("Phase 21 — Webhook Delivery Lifecycle, Retries & Dead Letter", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;
  let secretUsed: string;
  let endpointId: string;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);

    const created = await endpointService.createEndpoint({
      organizationId: "org_deliv_test",
      url: "https://api.receiver.com/webhook",
      eventTypes: ["*.*"],
    });
    endpointId = created.endpoint.id;
    secretUsed = created.secret;
  });

  it("successfully delivers on HTTP 200 and verifies signature headers", async () => {
    let receivedHeaders: any = {};
    let receivedBody = "";

    const mockFetcher: typeof fetch = async (url, init) => {
      receivedHeaders = init?.headers;
      receivedBody = init?.body as string;
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    };

    const deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
      fetcher: mockFetcher,
    });

    const { outboundEvent, deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_del_1",
      eventType: "request.completed",
      eventVersion: "v1",
      organizationId: "org_deliv_test",
      data: WebhookSerializer.sanitizeRequestCompleted({
        requestId: "req_test_123",
        model: "openai/gpt-4o",
        status: "completed",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
    });

    const outcome = await deliveryService.deliverSingle(deliveries[0]!);
    expect(outcome.status).toBe("succeeded");

    // Check delivery in DB
    const updated = await repository.getDelivery("org_deliv_test", deliveries[0]!.id);
    expect(updated!.status).toBe("succeeded");
    expect(updated!.deliveredAt).toBeDefined();

    // Verify signature header
    const sig = receivedHeaders[WEBHOOK_HEADERS.signature];
    const ts = parseInt(receivedHeaders[WEBHOOK_HEADERS.timestamp], 10);
    const eventId = receivedHeaders[WEBHOOK_HEADERS.id];

    expect(eventId).toBe(outboundEvent.id);
    expect(
      verifyWebhookSignature({
        id: eventId,
        timestamp: ts,
        body: receivedBody,
        signature: sig,
        secret: secretUsed,
      })
    ).toBe(true);
  });

  it("handles HTTP 429 rate limits and schedules retry using Retry-After header", async () => {
    const mockFetcher: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    };

    const deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
      fetcher: mockFetcher,
    });

    const { deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_del_429",
      eventType: "payment.failed",
      organizationId: "org_deliv_test",
      data: { paymentId: "pay_failed_1" },
    });

    const outcome = await deliveryService.deliverSingle(deliveries[0]!);
    expect(outcome.status).toBe("retrying");

    const updated = await repository.getDelivery("org_deliv_test", deliveries[0]!.id);
    expect(updated!.status).toBe("retrying");
    expect(updated!.attemptCount).toBe(1);
    expect(updated!.nextAttemptAt).toBeDefined();
  });

  it("transitions to dead_letter after exhausting max retry attempts", async () => {
    const mockFetcher: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      });
    };

    const deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
      fetcher: mockFetcher,
    });

    const { deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_del_500",
      eventType: "payment.failed",
      organizationId: "org_deliv_test",
      data: { paymentId: "pay_500_1" },
    });

    // Simulate reaching attempt 5
    await repository.updateDelivery(deliveries[0]!.id, { attemptCount: 4 });
    const claimed = await repository.getDelivery("org_deliv_test", deliveries[0]!.id);

    const outcome = await deliveryService.deliverSingle(claimed!);
    expect(outcome.status).toBe("dead_letter");

    const updated = await repository.getDelivery("org_deliv_test", deliveries[0]!.id);
    expect(updated!.status).toBe("dead_letter");
    expect(updated!.attemptCount).toBe(5);
  });
});
