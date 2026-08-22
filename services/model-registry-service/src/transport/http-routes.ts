import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createCanonicalModelRequestSchema,
  createModelAliasRequestSchema,
  createModelPricingRequestSchema,
  createProviderRouteRequestSchema,
  deprecateModelRequestSchema,
  GrowXProviderError,
  updateCanonicalModelRequestSchema,
  updateModelAliasRequestSchema,
  updateProviderRouteRequestSchema,
} from "@growx/contracts";
import type { ModelRegistryService } from "../application/model-registry-service.js";
import { toOpenAIModelItem, toOpenAIModelList } from "../domain/serializers.js";
import type { IPrivilegedAuthResolver } from "./privileged-auth.js";
import type { ICustomerAuthResolver } from "./customer-auth.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new GrowXProviderError(
      "model_invalid_request" as any,
      "Malformed JSON request body",
      false,
      400,
    );
  }
}

export function createModelRegistryHttpApp(options: {
  service: ModelRegistryService;
  privilegedAuth: IPrivilegedAuthResolver;
  customerAuth?: ICustomerAuthResolver;
}) {
  const { service, privilegedAuth } = options;

  return async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const parsedUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = parsedUrl.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    const requestId =
      (req.headers["x-request-id"] as string) || `req_${Date.now()}`;

    try {
      // -------------------------------------------------------------
      // Health & Liveness Probes
      // -------------------------------------------------------------
      if (
        pathname === "/health" ||
        pathname === "/live" ||
        pathname === "/ready"
      ) {
        return json(res, 200, {
          status: "ok",
          service: "model-registry-service",
        });
      }

      // -------------------------------------------------------------
      // Customer Model Catalog
      // -------------------------------------------------------------
      if (pathname === "/v1/models" && method === "GET") {
        const family = parsedUrl.searchParams.get("family") ?? undefined;
        const category = parsedUrl.searchParams.get("category") ?? undefined;
        const capability =
          parsedUrl.searchParams.get("capability") ?? undefined;
        const search = parsedUrl.searchParams.get("search") ?? undefined;
        const limitStr = parsedUrl.searchParams.get("limit");
        const limit = limitStr ? parseInt(limitStr, 10) : undefined;
        const cursor = parsedUrl.searchParams.get("cursor") ?? undefined;

        const result = await service.listCustomerModels({
          family,
          category,
          capability,
          search,
          limit,
          cursor,
        });

        return json(res, 200, {
          object: "list",
          data: result.items,
          has_more: result.hasMore,
        });
      }

      // Customer Model Detail
      const customerModelMatch = pathname.match(/^\/v1\/models\/([^/]+)$/);
      if (customerModelMatch && method === "GET") {
        const modelId = decodeURIComponent(customerModelMatch[1]!);
        if (modelId !== "resolve") {
          const model = await service.getCustomerModel(modelId);
          return json(res, 200, model);
        }
      }

      // Model Resolution (Data Plane Helper)
      const resolveMatch = pathname.match(/^\/v1\/models\/resolve\/([^/]+)$/);
      if (resolveMatch && method === "GET") {
        const requestedId = decodeURIComponent(resolveMatch[1]!);
        const resolved = await service.resolve(requestedId);
        return json(res, 200, resolved);
      }

      // -------------------------------------------------------------
      // OpenAI Compatibility Model Endpoints
      // -------------------------------------------------------------
      if (pathname === "/v1/openai/models" && method === "GET") {
        const allAdmin = await service.listAdminModels({
          customerVisible: true,
          status: ["active", "deprecated"],
        });
        return json(res, 200, toOpenAIModelList(allAdmin.items));
      }

      const openAIModelMatch = pathname.match(
        /^\/v1\/openai\/models\/([^/]+)$/,
      );
      if (openAIModelMatch && method === "GET") {
        const modelId = decodeURIComponent(openAIModelMatch[1]!);
        const model = await service.getCustomerModel(modelId);
        return json(res, 200, toOpenAIModelItem(model as any));
      }

      // -------------------------------------------------------------
      // Privileged Management Plane (/internal/ops/*)
      // -------------------------------------------------------------

      // 1. Privileged Models CRUD
      if (pathname === "/internal/ops/models" && method === "GET") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.read",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const models = await service.listAdminModels();
        return json(res, 200, { data: models.items, has_more: models.hasMore });
      }

      if (pathname === "/internal/ops/models" && method === "POST") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.write",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = createCanonicalModelRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const created = await service.createModel(
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 201, created);
      }

      const opsModelDetailMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)$/,
      );
      if (opsModelDetailMatch) {
        const id = decodeURIComponent(opsModelDetailMatch[1]!);

        if (method === "GET") {
          const auth = await privilegedAuth.authenticateAndAuthorize(
            req,
            "ops.models.read",
            requestId,
          );
          if (!auth.allowed) {
            return json(res, auth.status, {
              error: { code: auth.code, message: auth.message },
            });
          }

          const detail = await service.getAdminModelDetail(id);
          return json(res, 200, detail);
        }

        if (method === "PATCH") {
          const auth = await privilegedAuth.authenticateAndAuthorize(
            req,
            "ops.models.write",
            requestId,
          );
          if (!auth.allowed) {
            return json(res, auth.status, {
              error: { code: auth.code, message: auth.message },
            });
          }

          const body = await readJson(req);
          const parsed = updateCanonicalModelRequestSchema.safeParse(body);
          if (!parsed.success) {
            return json(res, 400, {
              error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
            });
          }

          const updated = await service.updateModel(
            id,
            parsed.data,
            auth.operatorId,
            requestId,
          );
          return json(res, 200, updated);
        }
      }

      // Lifecycle actions: disable, deprecate, retire
      const opsDisableMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/disable$/,
      );
      if (opsDisableMatch && method === "POST") {
        const id = decodeURIComponent(opsDisableMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.write",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const updated = await service.disableModel(
          id,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      const opsDeprecateMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/deprecate$/,
      );
      if (opsDeprecateMatch && method === "POST") {
        const id = decodeURIComponent(opsDeprecateMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.deprecate",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = deprecateModelRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const updated = await service.deprecateModel(
          id,
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      const opsRetireMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/retire$/,
      );
      if (opsRetireMatch && method === "POST") {
        const id = decodeURIComponent(opsRetireMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.retire",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const updated = await service.retireModel(
          id,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      // 2. Provider Routes
      const opsCreateRouteMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/routes$/,
      );
      if (opsCreateRouteMatch && method === "POST") {
        const modelId = decodeURIComponent(opsCreateRouteMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.routes.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = createProviderRouteRequestSchema.safeParse({
          ...(body as any),
          modelId,
        });
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const created = await service.addProviderRoute(
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 201, created);
      }

      const opsUpdateRouteMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/routes\/([^/]+)$/,
      );
      if (opsUpdateRouteMatch && method === "PATCH") {
        const routeId = decodeURIComponent(opsUpdateRouteMatch[2]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.routes.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = updateProviderRouteRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const updated = await service.updateProviderRoute(
          routeId,
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      const opsDisableRouteMatch = pathname.match(
        /^\/internal\/ops\/models\/([^/]+)\/routes\/([^/]+)\/disable$/,
      );
      if (opsDisableRouteMatch && method === "POST") {
        const routeId = decodeURIComponent(opsDisableRouteMatch[2]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.routes.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const updated = await service.disableProviderRoute(
          routeId,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      // 3. Aliases
      if (pathname === "/internal/ops/aliases" && method === "GET") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.read",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const aliases = await service.listAllAliases();
        return json(res, 200, { data: aliases });
      }

      if (pathname === "/internal/ops/aliases" && method === "POST") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.aliases.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = createModelAliasRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const created = await service.createAlias(
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 201, created);
      }

      const opsUpdateAliasMatch = pathname.match(
        /^\/internal\/ops\/aliases\/([^/]+)$/,
      );
      if (opsUpdateAliasMatch && method === "PATCH") {
        const aliasId = decodeURIComponent(opsUpdateAliasMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.aliases.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = updateModelAliasRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const updated = await service.updateAlias(
          aliasId,
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      const opsRetireAliasMatch = pathname.match(
        /^\/internal\/ops\/aliases\/([^/]+)\/retire$/,
      );
      if (opsRetireAliasMatch && method === "POST") {
        const aliasId = decodeURIComponent(opsRetireAliasMatch[1]!);
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.aliases.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const updated = await service.retireAlias(
          aliasId,
          auth.operatorId,
          requestId,
        );
        return json(res, 200, updated);
      }

      // 4. Pricing
      if (pathname === "/internal/ops/pricing" && method === "GET") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.models.read",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const modelId = parsedUrl.searchParams.get("modelId") ?? undefined;
        const routeId = parsedUrl.searchParams.get("routeId") ?? undefined;
        const pricing = await service.listPricing({ modelId, routeId });
        return json(res, 200, { data: pricing });
      }

      if (pathname === "/internal/ops/pricing" && method === "POST") {
        const auth = await privilegedAuth.authenticateAndAuthorize(
          req,
          "ops.pricing.manage",
          requestId,
        );
        if (!auth.allowed) {
          return json(res, auth.status, {
            error: { code: auth.code, message: auth.message },
          });
        }

        const body = await readJson(req);
        const parsed = createModelPricingRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, {
            error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
          });
        }

        const created = await service.addPricing(
          parsed.data,
          auth.operatorId,
          requestId,
        );
        return json(res, 201, created);
      }

      // Route Not Found
      return json(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: `Route '${method} ${pathname}' not found`,
        },
      });
    } catch (err: any) {
      if (err instanceof GrowXProviderError) {
        return json(res, err.status, {
          error: {
            code: err.code,
            message: err.message,
            retryable: err.retryable,
          },
        });
      }

      return json(res, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Internal server error",
        },
      });
    }
  };
}

export function startModelRegistryServer(
  port: number,
  options: {
    service: ModelRegistryService;
    privilegedAuth: IPrivilegedAuthResolver;
    customerAuth?: ICustomerAuthResolver;
  },
) {
  const handler = createModelRegistryHttpApp(options);
  const server = createServer(handler);
  server.listen(port);
  return server;
}
