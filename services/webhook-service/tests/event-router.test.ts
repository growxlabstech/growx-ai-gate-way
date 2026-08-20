import { describe, expect, it, beforeEach } from "vitest";
import { WebhookSerializer } from "@growx/webhooks";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";

describe("Phase 21 — Webhook Event Router & Redaction", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;

  beforeEach(async () => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);

    // Create Endpoint 1: Subscribed to payment.*
    await endpointService.createEndpoint({
      organizationId: "org_router_test",
      url: "https://api.payments.com/hook",
      eventTypes: ["payment.*"],
    });

    // Create Endpoint 2: Subscribed to invoice.issued.v1
    await endpointService.createEndpoint({
      organizationId: "org_router_test",
      url: "https://api.billing.com/hook",
      eventTypes: ["invoice.issued.v1"],
    });
  });

  it("routes payment.succeeded only to the endpoint subscribed to payment.*", async () => {
    const safeData = WebhookSerializer.sanitizePaymentSucceeded({
      paymentId: "pay_100",
      amount: "50.00",
      currency: "USD",
      status: "paid",
    });

    const { outboundEvent, deliveries } = await eventRouter.routeEvent({
      sourceEventId: "src_pay_1",
      eventType: "payment.succeeded",
      eventVersion: "v1",
      organizationId: "org_router_test",
      data: safeData,
    });

    expect(outboundEvent.id).toMatch(/^evt_/);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.destinationUrlSnapshot).toBe("https://api.payments.com/hook");
  });

  it("guarantees idempotency when same source event is routed multiple times", async () => {
    const safeData = WebhookSerializer.sanitizeInvoiceIssued({
      invoiceId: "inv_100",
      invoiceNumber: "GXL/2026/000001",
      currency: "USD",
      subtotal: "100.00",
      taxTotal: "10.00",
      total: "110.00",
      amountDue: "110.00",
      issueDate: new Date(),
      dueDate: new Date(),
    });

    // Route 1
    const res1 = await eventRouter.routeEvent({
      sourceEventId: "src_inv_100",
      eventType: "invoice.issued",
      eventVersion: "v1",
      organizationId: "org_router_test",
      data: safeData,
    });

    // Route 2 (duplicate)
    const res2 = await eventRouter.routeEvent({
      sourceEventId: "src_inv_100",
      eventType: "invoice.issued",
      eventVersion: "v1",
      organizationId: "org_router_test",
      data: safeData,
    });

    expect(res1.outboundEvent.id).toBe(res2.outboundEvent.id);
    expect(res1.deliveries.length).toBe(1);
    expect(res2.deliveries.length).toBe(1);
  });
});
