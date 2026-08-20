import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AuditService } from "../application/audit-service.js";
import type { SecurityService } from "../application/security-service.js";

export interface AuditHttpServerOptions {
  auditService: AuditService;
  securityService: SecurityService;
}

export function createAuditHttpServer(options: AuditHttpServerOptions) {
  const { auditService, securityService } = options;

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
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
      if (pathname === "/health" || pathname === "/live" || pathname === "/ready") {
        return sendJson(200, { status: "ok", service: "audit-service" });
      }

      // Tenant context
      const orgId = req.headers["x-organization-id"] as string;
      const workspaceId = req.headers["x-workspace-id"] as string | undefined;

      // ─── Customer Audit APIs ──────────────────────────────────────
      if (pathname === "/v1/audit/events" && method === "GET") {
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const limit = url.searchParams.get("limit")
          ? parseInt(url.searchParams.get("limit")!, 10)
          : 50;
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const actorId = url.searchParams.get("actorId") ?? undefined;
        const action = url.searchParams.get("action") ?? undefined;
        const resourceType = url.searchParams.get("resourceType") ?? undefined;
        const resourceId = url.searchParams.get("resourceId") ?? undefined;

        const events = await auditService.listCustomerAuditEvents(orgId, {
          workspaceId,
          limit,
          cursor,
          actorId,
          action,
          resourceType,
          resourceId,
        });

        return sendJson(200, { events });
      }

      const auditEventMatch = pathname.match(/^\/v1\/audit\/events\/([^/]+)$/);
      if (auditEventMatch && method === "GET") {
        if (!orgId) return sendJson(401, { error: "Missing organization context" });
        const eventId = auditEventMatch[1];
        const event = await auditService.getCustomerAuditEvent(orgId, eventId);
        if (!event) return sendJson(404, { error: "Audit event not found" });
        return sendJson(200, { event });
      }

      // ─── Customer Security APIs ───────────────────────────────────
      if (pathname === "/v1/security/events" && method === "GET") {
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const events = await securityService.listSecurityEvents(orgId, {
          workspaceId,
        });
        return sendJson(200, { events });
      }

      // ─── Internal Privileged APIs ─────────────────────────────────
      if (pathname === "/internal/audit/events" && method === "GET") {
        const targetOrgId = url.searchParams.get("organizationId") ?? undefined;
        const events = await auditService.listInternalAuditEvents({
          organizationId: targetOrgId,
        });
        return sendJson(200, { events });
      }

      if (pathname === "/internal/audit/integrity" && method === "GET") {
        const scope = url.searchParams.get("scope");
        if (!scope) return sendJson(400, { error: "scope parameter required" });

        const result = await auditService.verifyChain(scope);
        return sendJson(200, result);
      }

      if (pathname === "/internal/audit/checkpoints" && method === "POST") {
        const body = await parseBody();
        if (!body.scope) return sendJson(400, { error: "scope is required" });

        const checkpoint = await auditService.createCheckpoint(body.scope);
        return sendJson(201, { checkpoint });
      }

      if (pathname === "/internal/security/events" && method === "GET") {
        const targetOrgId = url.searchParams.get("organizationId") ?? undefined;
        const events = await securityService.listSecurityEvents(targetOrgId);
        return sendJson(200, { events });
      }

      if (pathname === "/internal/security/signals" && method === "GET") {
        const targetOrgId = url.searchParams.get("organizationId") ?? undefined;
        const signals = await securityService.listSecuritySignals(targetOrgId);
        return sendJson(200, { signals });
      }

      const signalStatusMatch = pathname.match(/^\/internal\/security\/signals\/([^/]+)\/status$/);
      if (signalStatusMatch && method === "POST") {
        const signalId = signalStatusMatch[1];
        const body = await parseBody();
        const updated = await securityService.updateSignalStatus(signalId, body.status);
        return sendJson(200, { signal: updated });
      }

      if (pathname === "/internal/security/timeline" && method === "GET") {
        const requestId = url.searchParams.get("requestId") ?? undefined;
        const actorId = url.searchParams.get("actorId") ?? undefined;
        const resourceId = url.searchParams.get("resourceId") ?? undefined;
        const targetOrgId = url.searchParams.get("organizationId") ?? undefined;

        const timeline = await securityService.buildIncidentTimeline({
          organizationId: targetOrgId,
          requestId,
          actorId,
          resourceId,
        });

        return sendJson(200, { timeline });
      }

      return sendJson(404, { error: "Route not found" });
    } catch (err: any) {
      return sendJson(500, { error: err.message ?? "Internal Server Error" });
    }
  });
}
