import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";
import { WebhookReplayService } from "../src/application/webhook-replay-service.js";

describe("Phase 21 — Webhook Tenant Isolation & Security", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;
  let replayService: WebhookReplayService;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);
    replayService = new WebhookReplayService(repository);

    // Org A endpoint
    await endpointService.createEndpoint({
      organizationId: "org_a",
      url: "https://api.orga.com/webhook",
      eventTypes: ["*.*"],
    });

    // Org B endpoint
    await endpointService.createEndpoint({
      organizationId: "org_b",
      url: "https://api.orgb.com/webhook",
      eventTypes: ["*.*"],
    });
  });

  it("never routes Org A domain events to Org B endpoints", async () => {
    const { outboundEvent, deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_iso_1",
      eventType: "payment.succeeded",
      organizationId: "org_a",
      data: { paymentId: "pay_org_a" },
    });

    expect(outboundEvent.organizationId).toBe("org_a");
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.organizationId).toBe("org_a");
    expect(deliveries[0]!.destinationUrlSnapshot).toBe("https://api.orga.com/webhook");

    // Org B list deliveries finds 0
    const orgBDeliveries = await repository.listDeliveries("org_b");
    expect(orgBDeliveries.length).toBe(0);
  });

  it("prevents Org B from inspecting or replaying Org A's deliveries", async () => {
    const { deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_iso_2",
      eventType: "invoice.issued",
      organizationId: "org_a",
      data: { invoiceId: "inv_org_a" },
    });

    const deliveryA = deliveries[0];

    // Org B attempts to read Org A delivery
    const attemptRead = await repository.getDelivery("org_b", deliveryA!.id);
    expect(attemptRead).toBeUndefined();

    // Org B attempts to replay Org A delivery -> throws error
    await expect(
      replayService.replayDelivery("org_b", deliveryA!.id)
    ).rejects.toThrow("Webhook delivery not found");
  });
});
