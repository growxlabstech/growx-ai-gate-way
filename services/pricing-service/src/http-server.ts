import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { createPublicId } from "@growx/ids";
import type { ApiKeyService } from "@growx/api-key-service";
import { PricingService, type PriceRequestParams } from "./application/pricing-service.js";

export interface PricingServerOptions {
  pricingService: PricingService;
  apiKeyService?: ApiKeyService | undefined;
  internalAdminKey?: string | undefined;
}

function safeJsonStringify(data: unknown): string {
  return JSON.stringify(data, (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(safeJsonStringify(data));
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createHttpHandler(options: PricingServerOptions) {
  const { pricingService } = options;
  const internalAdminKey = options.internalAdminKey ?? "growx_ops_internal_sec_token";

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rawUrl = req.url ?? "/";
    const method = req.method ?? "GET";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const pathname = parsedUrl.pathname;

    const requestId =
      (req.headers["x-growx-request-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      createPublicId("req");

    res.setHeader("x-growx-request-id", requestId);

    // 1. Health checks
    if (["/health", "/live", "/ready"].includes(pathname)) {
      sendJson(res, 200, {
        status: "ok",
        service: "pricing-service",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      // -------------------------------------------------------------
      // 2. PRIVILEGED INTERNAL PRICING API (Ops Plane)
      // -------------------------------------------------------------
      if (pathname.startsWith("/internal/pricing")) {
        const authHeader = req.headers.authorization ?? "";
        const internalKeyHeader = (req.headers["x-growx-internal-key"] as string) ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");

        const isAuthorized =
          internalKeyHeader === internalAdminKey ||
          token === internalAdminKey ||
          token.includes("ops.pricing");

        if (!isAuthorized) {
          sendJson(res, 403, {
            error: {
              code: "forbidden",
              message: "Privileged authentication required for internal pricing plane",
            },
          });
          return;
        }

        // GET /internal/pricing/provider-schedules
        if (pathname === "/internal/pricing/provider-schedules" && method === "GET") {
          const providerId = parsedUrl.searchParams.get("providerId");
          const status = parsedUrl.searchParams.get("status");
          const schedules = await pricingService.listProviderSchedules({
            ...(providerId ? { providerId } : {}),
            ...(status ? { status } : {}),
          });
          sendJson(res, 200, { data: schedules });
          return;
        }

        // POST /internal/pricing/provider-schedules
        if (pathname === "/internal/pricing/provider-schedules" && method === "POST") {
          const body = await parseBody<any>(req);
          const schedule = await pricingService.createProviderSchedule(body);
          sendJson(res, 201, { data: schedule });
          return;
        }

        // GET /internal/pricing/provider-schedules/:id
        if (pathname.startsWith("/internal/pricing/provider-schedules/") && method === "GET") {
          const id = pathname.replace("/internal/pricing/provider-schedules/", "");
          const schedule = await pricingService.getProviderSchedule(id);
          if (!schedule) {
            sendJson(res, 404, { error: { code: "not_found", message: "Provider schedule not found" } });
            return;
          }
          sendJson(res, 200, { data: schedule });
          return;
        }

        // POST /internal/pricing/provider-schedules/:id/retire
        if (pathname.match(/^\/internal\/pricing\/provider-schedules\/[^/]+\/retire$/) && method === "POST") {
          const id = pathname.split("/")[4]!;
          const retired = await pricingService.retireProviderSchedule(id);
          sendJson(res, 200, { data: retired });
          return;
        }

        // GET /internal/pricing/customer-policies
        if (pathname === "/internal/pricing/customer-policies" && method === "GET") {
          const scopeType = parsedUrl.searchParams.get("scopeType");
          const scopeId = parsedUrl.searchParams.get("scopeId");
          const policies = await pricingService.listCustomerPolicies({
            ...(scopeType ? { scopeType } : {}),
            ...(scopeId ? { scopeId } : {}),
          });
          sendJson(res, 200, { data: policies });
          return;
        }

        // POST /internal/pricing/customer-policies
        if (pathname === "/internal/pricing/customer-policies" && method === "POST") {
          const body = await parseBody<any>(req);
          const policy = await pricingService.createCustomerPolicy(body);
          sendJson(res, 201, { data: policy });
          return;
        }

        // GET /internal/pricing/customer-policies/:id
        if (pathname.startsWith("/internal/pricing/customer-policies/") && method === "GET") {
          const id = pathname.replace("/internal/pricing/customer-policies/", "");
          const policy = await pricingService.getCustomerPolicy(id);
          if (!policy) {
            sendJson(res, 404, { error: { code: "not_found", message: "Customer policy not found" } });
            return;
          }
          sendJson(res, 200, { data: policy });
          return;
        }

        // POST /internal/pricing/simulate
        if (pathname === "/internal/pricing/simulate" && method === "POST") {
          const body = await parseBody<any>(req);
          const result = await pricingService.simulatePrice(body);
          sendJson(res, 200, { data: result });
          return;
        }

        // POST /internal/pricing/calculate
        if (pathname === "/internal/pricing/calculate" && method === "POST") {
          const body = await parseBody<PriceRequestParams>(req);
          const result = await pricingService.priceRequest(body);
          sendJson(res, 200, { data: result });
          return;
        }

        // GET /internal/pricing/requests/:requestId
        if (pathname.startsWith("/internal/pricing/requests/") && method === "GET") {
          const reqId = pathname.replace("/internal/pricing/requests/", "");
          const result = await pricingService.getRequestPricing(reqId);
          if (!result) {
            sendJson(res, 404, { error: { code: "not_found", message: "Request pricing not found" } });
            return;
          }
          sendJson(res, 200, { data: result });
          return;
        }

        sendJson(res, 404, { error: { code: "not_found", message: "Internal route not found" } });
        return;
      }

      // -------------------------------------------------------------
      // 3. PUBLIC / TENANT PRICING API
      // -------------------------------------------------------------
      // POST /v1/pricing/simulate
      if (pathname === "/v1/pricing/simulate" && method === "POST") {
        const body = await parseBody<any>(req);
        const result = await pricingService.simulatePrice(body);
        sendJson(res, 200, { data: result });
        return;
      }

      // GET /v1/requests/:requestId/pricing
      if (pathname.startsWith("/v1/requests/") && pathname.endsWith("/pricing") && method === "GET") {
        const reqId = pathname.split("/")[3]!;
        const result = await pricingService.getRequestPricing(reqId);
        if (!result) {
          sendJson(res, 404, { error: { code: "not_found", message: "Request pricing not found" } });
          return;
        }
        sendJson(res, 200, { data: result });
        return;
      }

      sendJson(res, 404, { error: { code: "not_found", message: "Route not found" } });
    } catch (err: any) {
      sendJson(res, 500, {
        error: {
          code: "internal_pricing_error",
          message: err.message || "An unexpected error occurred in pricing service",
        },
      });
    }
  };
}
