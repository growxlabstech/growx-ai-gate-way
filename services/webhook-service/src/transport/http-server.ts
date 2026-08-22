import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WEBHOOK_EVENT_CATALOG, WebhookSerializer } from "@growx/webhooks";
import type { WebhookDeliveryService } from "../application/webhook-delivery-service.js";
import type { WebhookEndpointService } from "../application/webhook-endpoint-service.js";
import type { WebhookEventRouter } from "../application/webhook-event-router.js";
import type { WebhookReplayService } from "../application/webhook-replay-service.js";
import type { IWebhookRepository } from "../domain/types.js";

export interface WebhookHttpServerOptions {
  endpointService: WebhookEndpointService;
  eventRouter: WebhookEventRouter;
  deliveryService: WebhookDeliveryService;
  replayService: WebhookReplayService;
  repository: IWebhookRepository;
  allowInsecureHttp?: boolean | undefined;
}

export function createWebhookHttpServer(options: WebhookHttpServerOptions) {
  const {
    endpointService,
    eventRouter,
    replayService,
    repository,
    allowInsecureHttp,
  } = options;

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    const sendJson = (statusCode: number, data: any) => {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    const parseBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
      });
    };

    try {
      // ─── Health ────────────────────────────────────────────────
      if (
        pathname === "/health" ||
        pathname === "/live" ||
        pathname === "/ready"
      ) {
        return sendJson(200, { status: "ok", service: "webhook-service" });
      }

      // ─── Event Types Catalog ───────────────────────────────────
      if (pathname === "/v1/webhooks/event-types" && method === "GET") {
        return sendJson(200, { eventTypes: WEBHOOK_EVENT_CATALOG });
      }

      // Extract Tenant Context
      const orgId = req.headers["x-organization-id"] as string;
      const workspaceId = req.headers["x-workspace-id"] as string | undefined;

      // ─── Customer Endpoints ────────────────────────────────────
      if (pathname === "/v1/webhooks/endpoints") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });

        if (method === "GET") {
          const endpoints = await endpointService.listEndpoints(
            orgId,
            workspaceId,
          );
          return sendJson(200, { endpoints });
        }

        if (method === "POST") {
          const body = await parseBody();
          const result = await endpointService.createEndpoint({
            organizationId: orgId,
            workspaceId: body.workspaceId ?? workspaceId,
            url: body.url,
            description: body.description,
            eventTypes: body.eventTypes ?? ["*.*"],
            allowInsecureHttp,
          });
          return sendJson(201, result);
        }
      }

      const endpointMatch = pathname.match(
        /^\/v1\/webhooks\/endpoints\/([^/]+)$/,
      );
      if (endpointMatch) {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const endpointId = endpointMatch[1] ?? "";

        if (method === "GET") {
          const endpoint = await endpointService.getEndpoint(orgId, endpointId);
          if (!endpoint)
            return sendJson(404, { error: "Webhook endpoint not found" });
          return sendJson(200, { endpoint });
        }

        if (method === "PATCH" || method === "PUT") {
          const body = await parseBody();
          const endpoint = await endpointService.updateEndpoint(
            orgId,
            endpointId,
            {
              ...body,
              allowInsecureHttp,
            },
          );
          return sendJson(200, { endpoint });
        }

        if (method === "DELETE") {
          const endpoint = await endpointService.disableEndpoint(
            orgId,
            endpointId,
          );
          return sendJson(200, { endpoint });
        }
      }

      // Rotate secret
      const rotateMatch = pathname.match(
        /^\/v1\/webhooks\/endpoints\/([^/]+)\/rotate-secret$/,
      );
      if (rotateMatch && method === "POST") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const endpointId = rotateMatch[1] ?? "";
        const result = await endpointService.rotateSecret(orgId, endpointId);
        return sendJson(200, result);
      }

      // Test webhook trigger
      const testMatch = pathname.match(
        /^\/v1\/webhooks\/endpoints\/([^/]+)\/test$/,
      );
      if (testMatch && method === "POST") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const endpointId = testMatch[1] ?? "";
        const endpoint = await endpointService.getEndpoint(orgId, endpointId);
        if (!endpoint)
          return sendJson(404, { error: "Webhook endpoint not found" });

        const testData = WebhookSerializer.sanitizeTestPing({
          pingId: `ping_${Date.now()}`,
          endpointId,
          timestamp: new Date(),
        });

        const routed = await eventRouter.routeEvent({
          sourceEventId: `test_${Date.now()}`,
          eventType: "test.ping",
          eventVersion: "v1",
          organizationId: orgId,
          workspaceId: endpoint.workspaceId,
          data: testData,
        });

        return sendJson(200, {
          message: "Test webhook event dispatched",
          eventId: routed.outboundEvent.id,
        });
      }

      // ─── Customer Deliveries ───────────────────────────────────
      if (pathname === "/v1/webhooks/deliveries" && method === "GET") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const endpointIdQuery = url.searchParams.get("endpointId") ?? undefined;
        const statusQuery =
          (url.searchParams.get("status") as any) ?? undefined;

        const deliveries = await repository.listDeliveries(orgId, {
          endpointId: endpointIdQuery,
          status: statusQuery,
        });
        return sendJson(200, { deliveries });
      }

      const deliveryMatch = pathname.match(
        /^\/v1\/webhooks\/deliveries\/([^/]+)$/,
      );
      if (deliveryMatch && method === "GET") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const deliveryId = deliveryMatch[1] ?? "";
        const delivery = await repository.getDelivery(orgId, deliveryId);
        if (!delivery)
          return sendJson(404, { error: "Webhook delivery not found" });
        const attempts = await repository.listAttempts(delivery.id);
        return sendJson(200, { delivery, attempts });
      }

      const replayDeliveryMatch = pathname.match(
        /^\/v1\/webhooks\/deliveries\/([^/]+)\/replay$/,
      );
      if (replayDeliveryMatch && method === "POST") {
        if (!orgId)
          return sendJson(401, { error: "Missing organization context" });
        const deliveryId = replayDeliveryMatch[1] ?? "";
        const newDelivery = await replayService.replayDelivery(
          orgId,
          deliveryId,
        );
        return sendJson(201, { delivery: newDelivery });
      }

      // ─── Internal Privileged APIs ──────────────────────────────
      if (pathname === "/internal/webhooks/replay-jobs" && method === "POST") {
        const body = await parseBody();
        const result = await replayService.createBulkReplayJob({
          organizationId: body.organizationId,
          filterConfig: body.filterConfig ?? {},
        });
        return sendJson(201, result);
      }

      return sendJson(404, { error: "Route not found" });
    } catch (err: any) {
      return sendJson(500, { error: err.message ?? "Internal Server Error" });
    }
  });
}
