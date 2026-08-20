import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";
import { WebhookEventRouter } from "../src/application/webhook-event-router.js";
import { WebhookDeliveryService } from "../src/application/webhook-delivery-service.js";
import { WebhookReplayService } from "../src/application/webhook-replay-service.js";
import { createWebhookHttpServer } from "../src/transport/http-server.js";

describe("Phase 21 — Webhook HTTP Transport & API Endpoints", () => {
  let server: any;
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;
  let eventRouter: WebhookEventRouter;
  let deliveryService: WebhookDeliveryService;
  let replayService: WebhookReplayService;

  beforeEach(() => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
    eventRouter = new WebhookEventRouter(repository);
    deliveryService = new WebhookDeliveryService({
      repository,
      endpointService,
    });
    replayService = new WebhookReplayService(repository);

    server = createWebhookHttpServer({
      endpointService,
      eventRouter,
      deliveryService,
      replayService,
      repository,
      allowInsecureHttp: true,
    });
  });

  it("handles health check and event-types catalog endpoints", async () => {
    // 1. Health check
    await new Promise<void>((resolve) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/health";
      req.method = "GET";

      const res = {
        writeHead: (status: number) => expect(status).toBe(200),
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.status).toBe("ok");
          expect(json.service).toBe("webhook-service");
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });

    // 2. Event types catalog
    await new Promise<void>((resolve) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/v1/webhooks/event-types";
      req.method = "GET";

      const res = {
        writeHead: (status: number) => expect(status).toBe(200),
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.eventTypes).toBeDefined();
          expect(json.eventTypes.length).toBeGreaterThan(5);
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });
  });
});
