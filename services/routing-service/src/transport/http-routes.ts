import type { IncomingMessage, ServerResponse } from "node:http";
import { generateId } from "@growx/ids";
import type { IRoutingEvents } from "../application/events.js";
import type { IRoutingRepository } from "../application/repository.js";
import type { RoutingEngine } from "../application/routing-engine.js";
import type { RoutingEngineV2 } from "../application/routing-engine-v2.js";
import type { PolicyManagementService } from "../application/policy-management-service.js";
import type { RouteManagementService } from "../application/route-management-service.js";
import type { RoutingSimulationService } from "../application/simulation-service.js";
import type { ICustomerAuthResolver } from "./customer-auth.js";
import type { IPrivilegedAuthResolver } from "./privileged-auth.js";
import {
  createRoutingPolicyRequestSchema,
  updateRoutingPolicyRequestSchema,
  routingSimulationRequestSchema,
} from "@growx/contracts";

export interface CreateRoutingHttpAppOptions {
  repository: IRoutingRepository;
  events: IRoutingEvents;
  engine?: RoutingEngine | undefined;
  privilegedAuth: IPrivilegedAuthResolver;
  customerAuth: ICustomerAuthResolver;
  routerV2?: RoutingEngineV2 | undefined;
  policyService?: PolicyManagementService | undefined;
  routeControlService?: RouteManagementService | undefined;
  simulationService?: RoutingSimulationService | undefined;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      type: statusCode >= 500 ? "api_error" : "invalid_request_error",
    },
  });
}

async function readBodyJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        if (!raw.trim()) {
          resolve({});
        } else {
          resolve(JSON.parse(raw));
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createRoutingHttpApp(options: CreateRoutingHttpAppOptions) {
  const {
    repository,
    events,
    privilegedAuth,
    customerAuth,
    policyService,
    routeControlService,
    simulationService,
  } = options;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    try {
      // 1. Health Checks
      if (
        pathname === "/health" ||
        pathname === "/live" ||
        pathname === "/ready"
      ) {
        sendJson(res, 200, {
          status: "ok",
          service: "routing-service",
          routerVersion: "v2",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Customer Workspace Policy: GET /v1/workspaces/:workspaceId/routing-policy
      const wsPolicyMatch = pathname.match(
        /^\/v1\/workspaces\/([^/]+)\/routing-policy$/,
      );
      if (wsPolicyMatch) {
        const workspaceId = wsPolicyMatch[1]!;

        const customerSession = await customerAuth.resolveCustomerSession(
          req,
          workspaceId,
        );
        if (!customerSession) {
          sendError(res, 401, "unauthorized", "Authentication required");
          return;
        }

        const hasPermission =
          customerSession.permissions.includes("workspace.routing.manage") ||
          customerSession.permissions.includes("routing.read") ||
          customerSession.permissions.includes("routing.manage");

        if (!hasPermission) {
          sendError(
            res,
            403,
            "forbidden",
            "Insufficient permissions to access routing policy",
          );
          return;
        }

        if (method === "GET") {
          const policy = await repository.getPolicy(
            customerSession.organizationId,
            workspaceId,
          );
          if (!policy) {
            const global = await repository.getGlobalPolicy();
            const effective = global ?? {
              id: "default",
              organizationId: customerSession.organizationId,
              workspaceId,
              strategy: "priority",
              allowedProviders: [],
              deniedProviders: [],
              allowedRegions: [],
              deniedRegions: [],
              preferredProviders: [],
              dataRegion: undefined,
              maxEstimatedProviderCost: undefined,
              weights: undefined,
              sticky: false,
              enabled: true,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            sendJson(res, 200, { policy: effective });
            return;
          }
          sendJson(res, 200, { policy });
          return;
        }

        if (method === "PUT" || method === "PATCH") {
          const canManage =
            customerSession.permissions.includes("workspace.routing.manage") ||
            customerSession.permissions.includes("routing.manage");
          if (!canManage) {
            sendError(
              res,
              403,
              "forbidden",
              "Permission 'workspace.routing.manage' required",
            );
            return;
          }

          const body = await readBodyJson(req);
          const existing = await repository.getPolicy(
            customerSession.organizationId,
            workspaceId,
          );

          if (existing) {
            await repository.updatePolicy(existing.id, {
              strategy: body.strategy ?? existing.strategy,
              allowedProviders:
                body.allowedProviders ?? existing.allowedProviders,
              deniedProviders: body.deniedProviders ?? existing.deniedProviders,
              allowedRegions: body.allowedRegions ?? existing.allowedRegions,
              deniedRegions: body.deniedRegions ?? existing.deniedRegions,
              preferredProviders:
                body.preferredProviders ?? existing.preferredProviders,
              dataRegion: body.dataRegion ?? existing.dataRegion,
              maxEstimatedProviderCost:
                body.maxEstimatedProviderCost ??
                existing.maxEstimatedProviderCost,
              weights: body.weights ?? existing.weights,
              sticky: body.sticky ?? existing.sticky,
              enabled:
                body.enabled !== undefined ? body.enabled : existing.enabled,
            });

            const updated = await repository.getPolicyById(existing.id);
            if (updated) {
              await events.emitPolicyUpdated(updated, customerSession.userId);
            }
            sendJson(res, 200, { policy: updated ?? existing });
            return;
          } else {
            const created = {
              id: generateId("pol"),
              organizationId: customerSession.organizationId,
              workspaceId,
              strategy: body.strategy ?? "priority",
              allowedProviders: body.allowedProviders ?? [],
              deniedProviders: body.deniedProviders ?? [],
              allowedRegions: body.allowedRegions ?? [],
              deniedRegions: body.deniedRegions ?? [],
              preferredProviders: body.preferredProviders ?? [],
              dataRegion: body.dataRegion,
              maxEstimatedProviderCost: body.maxEstimatedProviderCost,
              weights: body.weights,
              sticky: body.sticky ?? false,
              enabled: body.enabled !== undefined ? body.enabled : true,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await repository.savePolicy(created as any);
            await events.emitPolicyCreated(
              created as any,
              customerSession.userId,
            );
            sendJson(res, 201, { policy: created });
            return;
          }
        }
      }

      // 3. Privileged Operations: /internal/routing/*
      if (pathname.startsWith("/internal/routing")) {
        const privSession = await privilegedAuth.resolvePrivilegedSession(req);
        if (!privSession) {
          sendError(
            res,
            401,
            "unauthorized",
            "Strong operator authentication required for /internal/routing/*",
          );
          return;
        }

        const hasManage =
          privSession.capabilities?.includes("ops.routing.manage");
        const hasRead =
          privSession.capabilities?.includes("ops.routing.read") || hasManage;

        if (!hasRead && !hasManage) {
          await events.emitSecurityEvent?.(
            "security.privileged.unauthorized_routing_access",
            {
              userId: privSession.userId,
              capabilities: privSession.capabilities,
            },
          );
          sendError(
            res,
            403,
            "forbidden",
            "Permission 'ops.routing.manage' or 'ops.routing.read' required",
          );
          return;
        }

        // Global Policy Endpoint: /internal/routing/global
        if (pathname === "/internal/routing/global") {
          if (method === "GET") {
            const globalPol = await repository.getGlobalPolicy();
            sendJson(res, 200, { policy: globalPol });
            return;
          }
          if (method === "PATCH" || method === "PUT") {
            if (!hasManage) {
              await events.emitSecurityEvent?.(
                "security.privileged.unauthorized_routing_access",
                {
                  userId: privSession.userId,
                  capabilities: privSession.capabilities,
                },
              );
              sendError(
                res,
                403,
                "forbidden",
                "Permission 'ops.routing.manage' required",
              );
              return;
            }
            const body = await readBodyJson(req);
            const existing = await repository.getGlobalPolicy();
            if (existing) {
              const updated = {
                ...existing,
                strategy: body.strategy ?? existing.strategy,
                allowedProviders:
                  body.allowedProviders ?? existing.allowedProviders,
                deniedProviders:
                  body.deniedProviders ?? existing.deniedProviders,
                allowedRegions: body.allowedRegions ?? existing.allowedRegions,
                deniedRegions: body.deniedRegions ?? existing.deniedRegions,
                preferredProviders:
                  body.preferredProviders ?? existing.preferredProviders,
                dataRegion: body.dataRegion ?? existing.dataRegion,
                maxEstimatedProviderCost:
                  body.maxEstimatedProviderCost ??
                  existing.maxEstimatedProviderCost,
                weights: body.weights ?? existing.weights,
                sticky: body.sticky ?? existing.sticky,
                enabled:
                  body.enabled !== undefined ? body.enabled : existing.enabled,
                version: (existing.version ?? 0) + 1,
                updatedAt: new Date(),
              };
              await repository.saveGlobalPolicy(updated as any);
              await events.emitGlobalPolicyUpdated(
                updated as any,
                privSession.userId,
              );
              sendJson(res, 200, { policy: updated });
              return;
            } else {
              const created = {
                id: generateId("pol"),
                organizationId: null,
                workspaceId: null,
                strategy: body.strategy ?? "priority",
                allowedProviders: body.allowedProviders ?? [],
                deniedProviders: body.deniedProviders ?? [],
                allowedRegions: body.allowedRegions ?? [],
                deniedRegions: body.deniedRegions ?? [],
                preferredProviders: body.preferredProviders ?? [],
                dataRegion: body.dataRegion,
                maxEstimatedProviderCost: body.maxEstimatedProviderCost,
                weights: body.weights,
                sticky: body.sticky ?? false,
                enabled: body.enabled !== undefined ? body.enabled : true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              await repository.saveGlobalPolicy(created as any);
              await events.emitGlobalPolicyUpdated(
                created as any,
                privSession.userId,
              );
              sendJson(res, 200, { policy: created });
              return;
            }
          }
        }

        const authContext: any = {
          actorType: "apiKey",
          apiKeyId: privSession.userId || "key_ops",
          organizationId: "org_ops",
          workspaceId: "ws_ops",
          environmentId: "env_prod",
          environment: "production",
          name: "Ops Auth",
          permissions: privSession.capabilities || [
            "ops.routing.read",
            "ops.routing.manage",
          ],
          modelRules: [],
          ipAllowlist: [],
          rateLimits: [],
          createdBy: privSession.userId || "usr_ops",
          createdAt: new Date(),
          expiresAt: null,
          lastUsedAt: new Date(),
        };

        // A. Policies list & create: /internal/routing/policies
        if (pathname === "/internal/routing/policies") {
          if (method === "GET") {
            const policies = policyService
              ? await policyService.listPolicies(authContext)
              : [];
            sendJson(res, 200, { data: policies });
            return;
          }
          if (method === "POST") {
            if (!hasManage) {
              await events.emitSecurityEvent?.(
                "security.privileged.unauthorized_routing_access",
                {
                  userId: privSession.userId,
                  capabilities: privSession.capabilities,
                },
              );
              sendError(
                res,
                403,
                "forbidden",
                "Permission 'ops.routing.manage' required",
              );
              return;
            }
            const body = await readBodyJson(req);
            const parsed = createRoutingPolicyRequestSchema.parse(body);
            const created = policyService
              ? await policyService.createPolicy(authContext, parsed)
              : null;
            sendJson(res, 201, created);
            return;
          }
        }

        // B. Single policy: /internal/routing/policies/:id
        const singlePolMatch = pathname.match(
          /^\/internal\/routing\/policies\/([^/]+)$/,
        );
        if (singlePolMatch) {
          const polId = singlePolMatch[1]!;
          if (method === "GET") {
            const pol = policyService
              ? await policyService.getPolicy(authContext, polId)
              : null;
            if (!pol) {
              sendError(
                res,
                404,
                "POLICY_NOT_FOUND",
                `Policy '${polId}' not found`,
              );
              return;
            }
            sendJson(res, 200, pol);
            return;
          }
          if (method === "PATCH") {
            if (!hasManage) {
              await events.emitSecurityEvent?.(
                "security.privileged.unauthorized_routing_access",
                {
                  userId: privSession.userId,
                  capabilities: privSession.capabilities,
                },
              );
              sendError(
                res,
                403,
                "forbidden",
                "Permission 'ops.routing.manage' required",
              );
              return;
            }
            const body = await readBodyJson(req);
            const parsed = updateRoutingPolicyRequestSchema.parse(body);
            const updated = policyService
              ? await policyService.updatePolicy(authContext, polId, parsed)
              : null;
            sendJson(res, 200, updated);
            return;
          }
        }

        // C. Activate / Retire policy: /internal/routing/policies/:id/activate | retire
        const polActionMatch = pathname.match(
          /^\/internal\/routing\/policies\/([^/]+)\/(activate|retire)$/,
        );
        if (polActionMatch && method === "POST") {
          if (!hasManage) {
            await events.emitSecurityEvent?.(
              "security.privileged.unauthorized_routing_access",
              {
                userId: privSession.userId,
                capabilities: privSession.capabilities,
              },
            );
            sendError(
              res,
              403,
              "forbidden",
              "Permission 'ops.routing.manage' required",
            );
            return;
          }
          const polId = polActionMatch[1]!;
          const action = polActionMatch[2]!;
          const result =
            action === "activate"
              ? await policyService?.activatePolicy(authContext, polId)
              : await policyService?.retirePolicy(authContext, polId);
          sendJson(res, 200, result);
          return;
        }

        // D. Route controls: /internal/routing/routes
        if (pathname === "/internal/routing/routes" && method === "GET") {
          const controls = routeControlService
            ? await routeControlService.listRouteControls()
            : [];
          sendJson(res, 200, { data: controls });
          return;
        }

        // E. Route Actions: /internal/routing/routes/:id/drain | disable | enable
        const routeActionMatch = pathname.match(
          /^\/internal\/routing\/routes\/([^/]+)\/(drain|disable|enable)$/,
        );
        if (routeActionMatch && method === "POST") {
          if (!hasManage) {
            await events.emitSecurityEvent?.(
              "security.privileged.unauthorized_routing_access",
              {
                userId: privSession.userId,
                capabilities: privSession.capabilities,
              },
            );
            sendError(
              res,
              403,
              "forbidden",
              "Permission 'ops.routing.manage' required",
            );
            return;
          }
          const routeId = routeActionMatch[1]!;
          const action = routeActionMatch[2]!;
          const body = await readBodyJson(req);

          let result;
          if (action === "drain") {
            result = await routeControlService?.drainRoute(
              authContext,
              routeId,
              body?.reason,
            );
          } else if (action === "disable") {
            result = await routeControlService?.disableRoute(
              authContext,
              routeId,
              body?.reason,
            );
          } else if (action === "enable") {
            result = await routeControlService?.enableRoute(
              authContext,
              routeId,
            );
          }
          sendJson(res, 200, result);
          return;
        }

        // F. Simulation API: /internal/routing/simulate
        if (pathname === "/internal/routing/simulate" && method === "POST") {
          const body = await readBodyJson(req);
          const parsed = routingSimulationRequestSchema.parse(body);
          const simulation = simulationService
            ? await simulationService.simulate(parsed)
            : null;
          sendJson(res, 200, simulation);
          return;
        }
      }

      // 404
      sendError(res, 404, "not_found", "Route not found");
    } catch (err: any) {
      if (err.name === "ZodError") {
        sendError(res, 400, "invalid_request", err.message);
        return;
      }
      sendError(
        res,
        500,
        "internal_error",
        err.message || "Internal server error",
      );
    }
  };
}
