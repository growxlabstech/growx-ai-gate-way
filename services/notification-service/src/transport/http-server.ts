import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { NotificationDeliveryService } from "../application/notification-delivery-service.js";
import type { INotificationRepository } from "../domain/types.js";

export interface NotificationHttpServerOptions {
  deliveryService: NotificationDeliveryService;
  repository: INotificationRepository;
}

export function createNotificationHttpServer(
  options: NotificationHttpServerOptions,
) {
  const { deliveryService, repository } = options;

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
      // ─── Health Checks ───────────────────────────────────────────
      if (
        pathname === "/health" ||
        pathname === "/live" ||
        pathname === "/ready"
      ) {
        return sendJson(200, { status: "ok", service: "notification-service" });
      }

      const userId = req.headers["x-user-id"] as string | undefined;
      const orgId = req.headers["x-organization-id"] as string | undefined;

      // ─── Direct Event Notification Ingestion ─────────────────────
      if (pathname === "/v1/notifications" && method === "POST") {
        const body = await parseBody();
        const result = await deliveryService.ingestAndFanout(
          {
            id: body.id ?? `evt_${Date.now()}`,
            type: body.type,
            organizationId: body.organizationId ?? orgId,
            workspaceId: body.workspaceId,
            data: body.data ?? body.variables ?? {},
          },
          body.recipients,
        );
        return sendJson(202, {
          data: {
            intentId: result.intent.id,
            deliveriesCount: result.deliveries.length,
            inAppCount: result.inAppNotifications.length,
          },
        });
      }

      // ─── In-App Notifications ─────────────────────────────────────
      if (pathname === "/v1/notifications" && method === "GET") {
        if (!userId) return sendJson(401, { error: "Missing user identity" });
        const unreadOnly = url.searchParams.get("unreadOnly") === "true";
        const notifications = await repository.listInAppNotifications(userId, {
          unreadOnly,
        });
        return sendJson(200, { notifications });
      }

      if (pathname === "/v1/notifications/unread-count" && method === "GET") {
        if (!userId) return sendJson(401, { error: "Missing user identity" });
        const unread = await repository.listInAppNotifications(userId, {
          unreadOnly: true,
        });
        return sendJson(200, { unreadCount: unread.length });
      }

      const readSingleMatch = pathname.match(
        /^\/v1\/notifications\/([^/]+)\/read$/,
      );
      if (readSingleMatch && method === "POST") {
        if (!userId) return sendJson(401, { error: "Missing user identity" });
        const notifId = readSingleMatch[1] ?? "";
        const updated = await repository.markInAppRead(userId, notifId);
        if (!updated) return sendJson(404, { error: "Notification not found" });
        return sendJson(200, { notification: updated });
      }

      if (pathname === "/v1/notifications/read-all" && method === "POST") {
        if (!userId) return sendJson(401, { error: "Missing user identity" });
        const count = await repository.markAllInAppRead(userId);
        return sendJson(200, { markedCount: count });
      }

      // ─── User Preferences ─────────────────────────────────────────
      if (pathname === "/v1/notification-preferences") {
        if (!userId) return sendJson(401, { error: "Missing user identity" });

        if (method === "GET") {
          const preferences = await repository.getPreferences(userId, orgId);
          return sendJson(200, { preferences });
        }

        if (method === "PATCH" || method === "PUT") {
          const body = await parseBody();
          // Validation: Cannot disable mandatory categories
          if (body.category === "authentication" && body.enabled === false) {
            return sendJson(400, {
              error:
                "Mandatory authentication notifications cannot be disabled",
            });
          }

          const updated = await repository.updatePreference({
            id: `pref_${userId}_${body.category}_${body.channel}`,
            userId,
            organizationId: orgId,
            category: body.category,
            channel: body.channel,
            enabled: body.enabled ?? true,
            updatedAt: new Date(),
          });
          return sendJson(200, { preference: updated });
        }
      }

      // ─── Resend Provider Callback ─────────────────────────────────
      if (
        pathname === "/v1/notifications/provider-callbacks/resend" &&
        method === "POST"
      ) {
        const body = await parseBody();
        if (body.type === "email.bounced" && body.data?.to) {
          for (const email of body.data.to) {
            await repository.createSuppression({
              id: `supp_${Date.now()}`,
              destination: email,
              reason: "hard_bounce",
              source: "resend_callback",
              createdAt: new Date(),
            });
          }
        }
        return sendJson(200, { received: true });
      }

      // ─── Internal Delivery Operations ─────────────────────────────
      if (
        pathname === "/internal/notifications/deliveries" &&
        method === "GET"
      ) {
        const status = url.searchParams.get("status") ?? undefined;
        const deliveries = await repository.listDeliveries({ status });
        return sendJson(200, { deliveries });
      }

      const retryDeliveryMatch = pathname.match(
        /^\/internal\/notifications\/deliveries\/([^/]+)\/retry$/,
      );
      if (retryDeliveryMatch && method === "POST") {
        const delId = retryDeliveryMatch[1] ?? "";
        const replayed = await deliveryService.replayDelivery(delId);
        return sendJson(200, { delivery: replayed });
      }

      return sendJson(404, { error: "Route not found" });
    } catch (err: any) {
      return sendJson(500, { error: err.message ?? "Internal Server Error" });
    }
  });
}
