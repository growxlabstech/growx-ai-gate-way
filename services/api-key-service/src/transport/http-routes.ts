import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyService } from "../application/api-key-service.js";
import type {
  ApiKeyRecord,
  ApiKeyScope,
  ModelRule,
  ApiKeyRateLimit,
  ApiKeySpendingLimit,
  ApiKeyEnvironment,
} from "../domain/types.js";
import { maskApiKey } from "../domain/key-format.js";
import {
  extractClientIp,
  hasApiKeyInQuery,
} from "./machine-auth-middleware.js";
import type { ManagementAuthResolver } from "./management-auth.js";

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

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

export function toApiKeyMetadata(record: ApiKeyRecord) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    environmentId: record.environmentId,
    environment: record.environment,
    name: record.name,
    prefix: record.prefix,
    maskedKey: maskApiKey(record.prefix),
    status: record.status,
    permissions: [...record.permissions],
    modelRules: [...record.modelRules],
    ipAllowlist: [...record.ipAllowlist],
    rateLimits: record.rateLimits ? [...record.rateLimits] : undefined,
    spendingLimit: record.spendingLimit
      ? { ...record.spendingLimit }
      : undefined,
    createdBy: record.createdBy,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : record.createdAt,
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : record.updatedAt,
    expiresAt:
      record.expiresAt instanceof Date
        ? record.expiresAt.toISOString()
        : (record.expiresAt ?? null),
    lastUsedAt:
      record.lastUsedAt instanceof Date
        ? record.lastUsedAt.toISOString()
        : (record.lastUsedAt ?? null),
    revokedAt:
      record.revokedAt instanceof Date
        ? record.revokedAt.toISOString()
        : (record.revokedAt ?? null),
    revokedBy: record.revokedBy ?? null,
  };
}

export function createHttpHandler(
  apiKeyService: ApiKeyService,
  serviceName = "api-key-service",
  managementAuth?: ManagementAuthResolver,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rawUrl = req.url ?? "";
    const method = req.method ?? "GET";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const pathname = parsedUrl.pathname;

    if (hasApiKeyInQuery(rawUrl)) {
      sendJson(res, 400, {
        error: {
          code: "INVALID_CREDENTIAL_LOCATION",
          message:
            "API keys and credentials must not be transmitted in query parameters",
        },
      });
      return;
    }

    if (["/health", "/live", "/ready"].includes(pathname)) {
      sendJson(res, 200, {
        status: "ok",
        service: serviceName,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Machine Authentication check endpoint
    if (pathname === "/v1/auth/check" && method === "GET") {
      const authorization = req.headers["authorization"];
      const clientIp = extractClientIp(req);
      const decision = await apiKeyService.authenticate({
        authorization:
          typeof authorization === "string" ? authorization : undefined,
        clientIp,
      });

      if (!decision.allowed) {
        sendJson(res, decision.status, {
          error: {
            code: decision.code,
            message: decision.code.replaceAll("_", " "),
          },
        });
        return;
      }

      sendJson(res, 200, {
        status: "ok",
        principal: decision.context,
      });
      return;
    }

    const requestId =
      (req.headers["x-request-id"] as string) ??
      `req_${crypto.randomUUID().replace(/-/g, "")}`;

    // Helper to strictly enforce Phase 1 Human Session Authentication and Phase 2 Tenancy Authorization
    async function checkManagementAuth(
      orgId: string,
      wsId: string,
      permission:
        | "apiKey.create"
        | "apiKey.read"
        | "apiKey.update"
        | "apiKey.revoke"
        | "apiKey.rotate",
    ): Promise<
      | { allowed: true; actorId: string }
      | { allowed: false; status: number; code: string; message: string }
    > {
      if (!managementAuth) {
        return {
          allowed: false,
          status: 401,
          code: "UNAUTHENTICATED",
          message:
            "Authentication resolver is required for management operations",
        };
      }
      const auth = await managementAuth.authenticateAndAuthorize(req, {
        organizationId: orgId,
        workspaceId: wsId,
        permission,
      });
      if (!auth.allowed) {
        return {
          allowed: false,
          status: auth.status,
          code: auth.code,
          message: auth.message,
        };
      }
      return { allowed: true, actorId: auth.principal!.userId };
    }

    // -------------------------------------------------------------
    // Customer API Key Management Endpoints (Human Session Plane)
    // -------------------------------------------------------------

    const createMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/?$/.exec(
        pathname,
      );
    if (createMatch && method === "POST") {
      const organizationId = createMatch[1]!;
      const workspaceId = createMatch[2]!;

      const auth = await checkManagementAuth(
        organizationId,
        workspaceId,
        "apiKey.create",
      );
      if (!auth.allowed) {
        sendJson(res, auth.status, {
          error: { code: auth.code, message: auth.message, requestId },
        });
        return;
      }
      const actorId = auth.actorId;

      try {
        const body = await parseBody<{
          environmentId?: string;
          environment?: ApiKeyEnvironment;
          name?: string;
          permissions?: ApiKeyScope[];
          modelRules?: ModelRule[];
          ipAllowlist?: string[];
          rateLimits?: ApiKeyRateLimitsInput;
          spendingLimit?: ApiKeySpendingLimit | null;
          expiresAt?: string | null;
        }>(req);

        const result = await apiKeyService.create({
          organizationId,
          workspaceId,
          environmentId:
            body.environmentId ??
            `env_${crypto.randomUUID().replace(/-/g, "")}`,
          environment: body.environment ?? "development",
          name: body.name ?? "API Key",
          permissions: body.permissions,
          modelRules: body.modelRules,
          ipAllowlist: body.ipAllowlist,
          rateLimits: body.rateLimits,
          spendingLimit: body.spendingLimit,
          createdBy: actorId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });

        sendJson(
          res,
          201,
          {
            apiKey: toApiKeyMetadata(result.record),
            secret: result.secret,
          },
          {
            "cache-control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        );
        return;
      } catch (err) {
        sendJson(res, 400, {
          error: {
            code: "CREATE_API_KEY_FAILED",
            message: err instanceof Error ? err.message : "Unknown error",
            requestId,
          },
        });
        return;
      }
    }

    if (createMatch && method === "GET") {
      const organizationId = createMatch[1]!;
      const workspaceId = createMatch[2]!;

      const auth = await checkManagementAuth(
        organizationId,
        workspaceId,
        "apiKey.read",
      );
      if (!auth.allowed) {
        sendJson(res, auth.status, {
          error: { code: auth.code, message: auth.message, requestId },
        });
        return;
      }

      try {
        const limitParam = parsedUrl.searchParams.get("limit");
        const limit = limitParam ? Number(limitParam) : 50;

        const { items, hasMore } = await apiKeyService.list(
          organizationId,
          workspaceId,
          { limit },
        );
        sendJson(res, 200, {
          data: items.map(toApiKeyMetadata),
          pagination: { cursor: null, hasMore },
        });
        return;
      } catch (err) {
        sendJson(res, 500, {
          error: {
            code: "LIST_API_KEYS_FAILED",
            message: err instanceof Error ? err.message : "Unknown error",
            requestId,
          },
        });
        return;
      }
    }

    const rotateMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/rotate\/?$/.exec(
        pathname,
      );
    if (rotateMatch && method === "POST") {
      const organizationId = rotateMatch[1]!;
      const workspaceId = rotateMatch[2]!;
      const id = rotateMatch[3]!;

      const auth = await checkManagementAuth(
        organizationId,
        workspaceId,
        "apiKey.rotate",
      );
      if (!auth.allowed) {
        sendJson(res, auth.status, {
          error: { code: auth.code, message: auth.message, requestId },
        });
        return;
      }
      const actorId = auth.actorId;

      try {
        const body = await parseBody<{
          overlapMinutes?: number;
          reason?: string;
        }>(req);

        const rotateOpts =
          body.reason !== undefined
            ? { overlapMinutes: body.overlapMinutes ?? 0, reason: body.reason }
            : { overlapMinutes: body.overlapMinutes ?? 0 };

        const result = await apiKeyService.rotate(
          organizationId,
          workspaceId,
          id,
          actorId,
          rotateOpts,
        );

        sendJson(
          res,
          200,
          {
            apiKey: toApiKeyMetadata(result.newRecord),
            secret: result.secret,
            oldApiKey: toApiKeyMetadata(result.oldRecord),
          },
          {
            "cache-control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        );
        return;
      } catch (err) {
        sendJson(res, 400, {
          error: {
            code: "ROTATE_API_KEY_FAILED",
            message: err instanceof Error ? err.message : "Unknown error",
            requestId,
          },
        });
        return;
      }
    }

    const permissionsMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/permissions\/?$/.exec(
        pathname,
      );
    if (permissionsMatch) {
      const organizationId = permissionsMatch[1]!;
      const workspaceId = permissionsMatch[2]!;
      const id = permissionsMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const key = await apiKeyService.get(organizationId, workspaceId, id);
        if (!key) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: key.permissions });
        return;
      }
      if (method === "PUT") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        const body = await parseBody<{ permissions: ApiKeyScope[] }>(req);
        await apiKeyService.updatePermissions(
          organizationId,
          workspaceId,
          id,
          body.permissions ?? [],
          actorId,
        );
        sendJson(res, 200, { success: true, permissions: body.permissions });
        return;
      }
    }

    const modelsMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/models\/?$/.exec(
        pathname,
      );
    if (modelsMatch) {
      const organizationId = modelsMatch[1]!;
      const workspaceId = modelsMatch[2]!;
      const id = modelsMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const key = await apiKeyService.get(organizationId, workspaceId, id);
        if (!key) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: key.modelRules });
        return;
      }
      if (method === "PUT") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        const body = await parseBody<{ modelRules: ModelRule[] }>(req);
        await apiKeyService.updateModelRules(
          organizationId,
          workspaceId,
          id,
          body.modelRules ?? [],
          actorId,
        );
        sendJson(res, 200, { success: true, modelRules: body.modelRules });
        return;
      }
    }

    const rateLimitsMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/rate-limits\/?$/.exec(
        pathname,
      );
    if (rateLimitsMatch) {
      const organizationId = rateLimitsMatch[1]!;
      const workspaceId = rateLimitsMatch[2]!;
      const id = rateLimitsMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const key = await apiKeyService.get(organizationId, workspaceId, id);
        if (!key) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: key.rateLimits ?? [] });
        return;
      }
      if (method === "PUT") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        const body = await parseBody<{ rateLimits: ApiKeyRateLimit[] }>(req);
        await apiKeyService.updateRateLimits(
          organizationId,
          workspaceId,
          id,
          body.rateLimits ?? [],
          actorId,
        );
        sendJson(res, 200, { success: true, rateLimits: body.rateLimits });
        return;
      }
    }

    const spendingLimitMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/spending-limit\/?$/.exec(
        pathname,
      );
    if (spendingLimitMatch) {
      const organizationId = spendingLimitMatch[1]!;
      const workspaceId = spendingLimitMatch[2]!;
      const id = spendingLimitMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const key = await apiKeyService.get(organizationId, workspaceId, id);
        if (!key) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: key.spendingLimit ?? null });
        return;
      }
      if (method === "PUT") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        const body = await parseBody<{
          spendingLimit: ApiKeySpendingLimit | null;
        }>(req);
        await apiKeyService.updateSpendingLimit(
          organizationId,
          workspaceId,
          id,
          body.spendingLimit ?? null,
          actorId,
        );
        sendJson(res, 200, {
          success: true,
          spendingLimit: body.spendingLimit,
        });
        return;
      }
    }

    const ipRulesMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/ip-rules\/?$/.exec(
        pathname,
      );
    if (ipRulesMatch) {
      const organizationId = ipRulesMatch[1]!;
      const workspaceId = ipRulesMatch[2]!;
      const id = ipRulesMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const key = await apiKeyService.get(organizationId, workspaceId, id);
        if (!key) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: key.ipAllowlist });
        return;
      }
      if (method === "PUT") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        const body = await parseBody<{ ipAllowlist: string[] }>(req);
        await apiKeyService.updateIpAllowlist(
          organizationId,
          workspaceId,
          id,
          body.ipAllowlist ?? [],
          actorId,
        );
        sendJson(res, 200, { success: true, ipAllowlist: body.ipAllowlist });
        return;
      }
    }

    const keyMatch =
      /^\/v1\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api-keys\/([^/]+)\/?$/.exec(
        pathname,
      );
    if (keyMatch) {
      const organizationId = keyMatch[1]!;
      const workspaceId = keyMatch[2]!;
      const id = keyMatch[3]!;

      if (method === "GET") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.read",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const record = await apiKeyService.get(organizationId, workspaceId, id);
        if (!record) {
          sendJson(res, 404, {
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
              requestId,
            },
          });
          return;
        }
        sendJson(res, 200, { data: toApiKeyMetadata(record) });
        return;
      }

      if (method === "PATCH") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.update",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        try {
          const body = await parseBody<{
            name?: string;
            expiresAt?: string | null;
            permissions?: ApiKeyScope[];
            modelRules?: ModelRule[];
            ipAllowlist?: string[];
          }>(req);
          const updated = await apiKeyService.update(
            organizationId,
            workspaceId,
            id,
            {
              name: body.name,
              expiresAt: body.expiresAt
                ? new Date(body.expiresAt)
                : body.expiresAt === null
                  ? null
                  : undefined,
              permissions: body.permissions,
              modelRules: body.modelRules,
              ipAllowlist: body.ipAllowlist,
              actorId,
            },
          );
          sendJson(res, 200, { data: toApiKeyMetadata(updated) });
          return;
        } catch (err) {
          sendJson(res, 400, {
            error: {
              code: "UPDATE_API_KEY_FAILED",
              message: err instanceof Error ? err.message : "Unknown error",
              requestId,
            },
          });
          return;
        }
      }

      if (method === "DELETE") {
        const auth = await checkManagementAuth(
          organizationId,
          workspaceId,
          "apiKey.revoke",
        );
        if (!auth.allowed) {
          sendJson(res, auth.status, {
            error: { code: auth.code, message: auth.message, requestId },
          });
          return;
        }
        const actorId = auth.actorId;
        try {
          const revoked = await apiKeyService.revoke(
            organizationId,
            workspaceId,
            id,
            actorId,
          );
          sendJson(res, 200, {
            success: true,
            data: toApiKeyMetadata(revoked),
          });
          return;
        } catch (err) {
          sendJson(res, 400, {
            error: {
              code: "REVOKE_API_KEY_FAILED",
              message: err instanceof Error ? err.message : "Unknown error",
              requestId,
            },
          });
          return;
        }
      }
    }

    sendJson(res, 404, {
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  };
}

type ApiKeyRateLimitsInput = ApiKeyRateLimit[];
