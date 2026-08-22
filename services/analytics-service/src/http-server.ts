import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { URL } from "node:url";
import {
  AnalyticsQueryService,
  AnalyticsProjectionEngine,
  AnalyticsRebuildService,
  OperationalSignalService,
  AnalyticsRepository,
  InMemoryAnalyticsRepository,
} from "@growx/analytics";
import type { ApiKeyService } from "@growx/api-key-service";
import { createPublicId } from "@growx/ids";

export interface AnalyticsServerOptions {
  apiKeyService: ApiKeyService;
  queryService: AnalyticsQueryService;
  projectionEngine: AnalyticsProjectionEngine;
  rebuildService: AnalyticsRebuildService;
  anomalyService: OperationalSignalService;
  repository: AnalyticsRepository;
  internalAdminKey?: string;
}

function parseDate(value: string | null | undefined, defaultDate: Date): Date {
  if (!value) return defaultDate;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${value}`);
  }
  return parsed;
}

export function createAnalyticsServer(options: AnalyticsServerOptions): Server {
  const internalAdminKey =
    options.internalAdminKey ?? "growx_ops_internal_sec_token";

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestId =
      (req.headers["x-growx-request-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      createPublicId("req");

    res.setHeader("x-growx-request-id", requestId);

    // 1. Health probes
    if (req.url === "/health" || req.url === "/live" || req.url === "/ready") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "analytics-service",
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    const parsedUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = parsedUrl.pathname;

    try {
      // -------------------------------------------------------------
      // 2. PRIVILEGED INTERNAL ANALYTICS (Ops Plane)
      // -------------------------------------------------------------
      if (pathname.startsWith("/internal/analytics")) {
        const authHeader = req.headers.authorization ?? "";
        const internalKeyHeader =
          (req.headers["x-growx-internal-key"] as string) ?? "";
        const isAuthorized =
          internalKeyHeader === internalAdminKey ||
          authHeader === `Bearer ${internalAdminKey}` ||
          authHeader.includes("ops_admin");

        if (!isAuthorized) {
          res.writeHead(403, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: {
                code: "forbidden",
                message: "Privileged capability required (ops.analytics.read)",
              },
            }),
          );
          return;
        }

        const now = new Date();
        const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const startTime = parseDate(
          parsedUrl.searchParams.get("from"),
          defaultStart,
        );
        const endTime = parseDate(parsedUrl.searchParams.get("to"), now);

        // GET /internal/analytics/providers
        if (
          req.method === "GET" &&
          pathname === "/internal/analytics/providers"
        ) {
          const data = await options.queryService.getInternalProviderAnalytics({
            startTime,
            endTime,
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(data));
          return;
        }

        // GET /internal/analytics/reliability
        if (
          req.method === "GET" &&
          pathname === "/internal/analytics/reliability"
        ) {
          const data =
            await options.queryService.getInternalReliabilityAnalytics({
              startTime,
              endTime,
            });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(data));
          return;
        }

        // GET /internal/analytics/anomalies
        if (
          req.method === "GET" &&
          pathname === "/internal/analytics/anomalies"
        ) {
          const orgIdParam = parsedUrl.searchParams.get("organizationId");
          const provIdParam = parsedUrl.searchParams.get("providerId");
          const anomalies =
            await options.anomalyService.evaluateOperationalHealth({
              ...(orgIdParam ? { organizationId: orgIdParam } : {}),
              ...(provIdParam ? { providerId: provIdParam } : {}),
              now,
            });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ anomalies }));
          return;
        }

        // POST /internal/analytics/projections/rebuild
        if (
          req.method === "POST" &&
          pathname === "/internal/analytics/projections/rebuild"
        ) {
          const result =
            await options.rebuildService.rebuildFromAuthoritativeLedger();
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ status: "completed", ...result }));
          return;
        }

        res.writeHead(404, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(
          JSON.stringify({
            error: { code: "not_found", message: "Internal route not found" },
          }),
        );
        return;
      }

      // -------------------------------------------------------------
      // 3. CUSTOMER ANALYTICS (/v1/analytics/*)
      // -------------------------------------------------------------
      if (pathname.startsWith("/v1/analytics")) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          res.writeHead(401, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: {
                code: "unauthorized",
                message: "Missing or invalid Authorization header",
              },
            }),
          );
          return;
        }

        const rawSecret = authHeader.slice(7).trim();
        const clientIp =
          (req.headers["x-forwarded-for"] as string) ||
          req.socket.remoteAddress ||
          "127.0.0.1";
        const authDecision = await options.apiKeyService.authenticate(
          rawSecret,
          { clientIp },
        );

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status ?? 401, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: {
                code: authDecision.code,
                message: "Authentication failed",
              },
            }),
          );
          return;
        }

        const auth = authDecision.context;
        const hasScope =
          auth.permissions.includes("analytics.read") ||
          auth.permissions.includes("usage.read") ||
          auth.permissions.includes("chat.completions.create");

        if (!hasScope) {
          res.writeHead(403, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: {
                code: "forbidden",
                message: "API key lacks analytics.read permission",
              },
            }),
          );
          return;
        }

        const now = new Date();
        const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let startTime: Date;
        let endTime: Date;

        try {
          startTime = parseDate(
            parsedUrl.searchParams.get("from"),
            defaultStart,
          );
          endTime = parseDate(parsedUrl.searchParams.get("to"), now);
          if (startTime > endTime) {
            res.writeHead(400, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            res.end(
              JSON.stringify({
                error: {
                  code: "invalid_range",
                  message: "'from' date cannot be after 'to' date",
                },
              }),
            );
            return;
          }
        } catch (e: any) {
          res.writeHead(400, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: { code: "invalid_date", message: e.message },
            }),
          );
          return;
        }

        const granularity =
          (parsedUrl.searchParams.get("granularity") as any) ?? "auto";
        const apiKeyParam = parsedUrl.searchParams.get("apiKeyId") ?? undefined;
        const modelParam = parsedUrl.searchParams.get("model") ?? undefined;

        // GET /v1/analytics/usage
        if (req.method === "GET" && pathname === "/v1/analytics/usage") {
          const summary = await options.queryService.getCustomerUsageSummary({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            ...(apiKeyParam ? { apiKeyId: apiKeyParam } : {}),
            startTime,
            endTime,
            granularity,
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(summary));
          return;
        }

        // GET /v1/analytics/timeseries
        if (req.method === "GET" && pathname === "/v1/analytics/timeseries") {
          const series = await options.queryService.getCustomerTimeseries({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            ...(apiKeyParam ? { apiKeyId: apiKeyParam } : {}),
            ...(modelParam ? { canonicalModelId: modelParam } : {}),
            startTime,
            endTime,
            granularity,
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(series));
          return;
        }

        // GET /v1/analytics/models
        if (req.method === "GET" && pathname === "/v1/analytics/models") {
          const models = await options.queryService.getModelBreakdown({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            startTime,
            endTime,
            limit: Number(parsedUrl.searchParams.get("limit") ?? 20),
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(models));
          return;
        }

        // GET /v1/analytics/api-keys
        if (req.method === "GET" && pathname === "/v1/analytics/api-keys") {
          const keys = await options.queryService.getApiKeyBreakdown({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            startTime,
            endTime,
            limit: Number(parsedUrl.searchParams.get("limit") ?? 20),
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(keys));
          return;
        }

        // GET /v1/analytics/workspaces
        if (req.method === "GET" && pathname === "/v1/analytics/workspaces") {
          const workspaces = await options.queryService.getWorkspaceBreakdown({
            organizationId: auth.organizationId,
            startTime,
            endTime,
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(workspaces));
          return;
        }

        // GET /v1/analytics/requests
        if (req.method === "GET" && pathname === "/v1/analytics/requests") {
          const statusParam = parsedUrl.searchParams.get("status") ?? undefined;
          const cursorParam = parsedUrl.searchParams.get("cursor") ?? undefined;

          const drilldown = await options.queryService.getRequestDrilldown({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            ...(apiKeyParam ? { apiKeyId: apiKeyParam } : {}),
            ...(modelParam ? { canonicalModelId: modelParam } : {}),
            ...(statusParam ? { status: statusParam } : {}),
            limit: Number(parsedUrl.searchParams.get("limit") ?? 20),
            ...(cursorParam ? { cursor: cursorParam } : {}),
          });
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(drilldown));
          return;
        }

        // GET /v1/analytics/requests/:requestId
        if (
          req.method === "GET" &&
          pathname.startsWith("/v1/analytics/requests/")
        ) {
          const targetReqId = pathname.slice("/v1/analytics/requests/".length);
          const reqRecord =
            await options.repository.getRequestRecord(targetReqId);

          if (!reqRecord || reqRecord.organizationId !== auth.organizationId) {
            res.writeHead(404, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            res.end(
              JSON.stringify({
                error: { code: "not_found", message: "Request not found" },
              }),
            );
            return;
          }

          const attempts =
            await options.repository.listAttemptsForRequest(targetReqId);

          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              request: {
                id: reqRecord.requestId,
                model: reqRecord.canonicalModelId,
                status: reqRecord.status,
                streaming: reqRecord.streaming,
                startedAt: reqRecord.startedAt.toISOString(),
                completedAt: reqRecord.completedAt?.toISOString(),
                durationMs: reqRecord.durationMs,
                ttftMs: reqRecord.ttftMs,
                logicalUsage: reqRecord.logicalUsage,
                attemptCount: reqRecord.attemptCount,
                retryCount: reqRecord.retryCount,
                fallbackCount: reqRecord.fallbackCount,
              },
              attempts: attempts.map((a) => ({
                attemptNumber: a.attemptNumber,
                status: a.status,
                durationMs: a.durationMs,
                ttftMs: a.ttftMs,
                usage: a.usage,
              })),
            }),
          );
          return;
        }
      }

      res.writeHead(404, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          error: { code: "not_found", message: "Route not found" },
        }),
      );
    } catch (err: any) {
      res.writeHead(500, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          error: {
            code: "internal_error",
            message: err.message ?? "Internal server error",
          },
        }),
      );
    }
  });
}
