import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { toNodeHandler } from "better-auth/node";
import { loadEnvironment } from "@growx/configuration";
import { createDatabase } from "@growx/database";
import {
  listUserSessions,
  revokeUserSession,
  revokeAllUserSessions,
  getUserTenantContext,
} from "./session-management";
import {
  createJitPrivilegedSession,
  revokeJitPrivilegedSession,
  type StepUpRequest,
} from "./privileged-handler";
import {
  acceptOrganizationInvitation,
  createFirstOrganization,
  createFirstWorkspace,
} from "./tenancy-handler";

export const serviceName = "identity-service";

const environment = loadEnvironment();
const database = createDatabase(environment.DATABASE_URL);

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
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

async function getAuthenticatedUserSession(req: IncomingMessage) {
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({
    headers: req.headers as Record<string, string>,
  });
  return session;
}

export function createApp() {
  return createServer(async (request, response) => {
    const url = request.url ?? "";
    const method = request.method ?? "GET";

    if (["/health", "/live", "/ready"].includes(url)) {
      sendJson(response, 200, {
        status: "ok",
        service: serviceName,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const requestId =
      (request.headers["x-request-id"] as string) ??
      `req_${crypto.randomUUID().replace(/-/g, "")}`;

    // Custom Session & Context endpoints
    if (url === "/v1/auth/sessions" && method === "GET") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const sessions = await listUserSessions(
          database.db,
          sessionState.user.id,
          sessionState.session.id,
        );
        sendJson(response, 200, { sessions });
        return;
      } catch (err) {
        sendJson(response, 500, {
          error: err instanceof Error ? err.message : "Internal error",
        });
        return;
      }
    }

    if (url.startsWith("/v1/auth/sessions/") && method === "DELETE") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const sessionId = url.replace("/v1/auth/sessions/", "");
        const revoked = await revokeUserSession(
          database.db,
          sessionState.user.id,
          sessionId,
          requestId,
        );
        if (!revoked) {
          sendJson(response, 404, {
            error: "Session not found or already revoked",
          });
          return;
        }
        sendJson(response, 200, {
          success: true,
          message: "Session revoked successfully",
        });
        return;
      } catch (err) {
        sendJson(response, 500, {
          error: err instanceof Error ? err.message : "Internal error",
        });
        return;
      }
    }

    if (url === "/v1/auth/logout-all" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const count = await revokeAllUserSessions(
          database.db,
          sessionState.user.id,
          undefined,
          requestId,
        );
        sendJson(response, 200, { success: true, revokedCount: count });
        return;
      } catch (err) {
        sendJson(response, 500, {
          error: err instanceof Error ? err.message : "Internal error",
        });
        return;
      }
    }

    if (url === "/v1/auth/context" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const tenantContext = await getUserTenantContext(
          database.db,
          sessionState.user.id,
        );
        if (!tenantContext) {
          sendJson(response, 404, { error: "User tenant context not found" });
          return;
        }
        sendJson(response, 200, {
          user: tenantContext.user,
          sessionId: sessionState.session.id,
          organizations: tenantContext.organizations,
          workspaces: tenantContext.workspaces,
        });
        return;
      } catch (err) {
        sendJson(response, 500, {
          error: err instanceof Error ? err.message : "Internal error",
        });
        return;
      }
    }

    if (url === "/v1/onboarding/organization" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication required",
              requestId,
            },
          });
          return;
        }
        const result = await createFirstOrganization(
          database.db,
          sessionState.user.id,
          await parseBody<unknown>(request),
          requestId,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      } catch (err) {
        const message =
          err instanceof Error && err.name === "ZodError"
            ? "Organization details are invalid."
            : "Organization could not be created.";
        sendJson(
          response,
          err instanceof Error && err.name === "ZodError" ? 400 : 409,
          { error: { code: "ORGANIZATION_CREATE_FAILED", message, requestId } },
        );
        return;
      }
    }

    if (url === "/v1/onboarding/workspace" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication required",
              requestId,
            },
          });
          return;
        }
        const body = await parseBody<Record<string, unknown>>(request);
        const organizationId =
          typeof body.organizationId === "string" ? body.organizationId : "";
        const result = await createFirstWorkspace(
          database.db,
          sessionState.user.id,
          organizationId,
          body,
          requestId,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      } catch (err) {
        const denied =
          err instanceof Error && err.message === "WORKSPACE_CREATE_DENIED";
        const invalid = err instanceof Error && err.name === "ZodError";
        sendJson(response, denied ? 403 : invalid ? 400 : 409, {
          error: {
            code: denied
              ? "WORKSPACE_CREATE_DENIED"
              : "WORKSPACE_CREATE_FAILED",
            message: denied
              ? "Workspace creation is not permitted."
              : invalid
                ? "Workspace details are invalid."
                : "Workspace could not be created.",
            requestId,
          },
        });
        return;
      }
    }

    if (url === "/v1/invitations/accept" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id || !sessionState.user.email) {
          sendJson(response, 401, {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication required",
              requestId,
            },
          });
          return;
        }
        const body = await parseBody<{ token?: unknown }>(request);
        if (
          typeof body.token !== "string" ||
          body.token.length < 16 ||
          body.token.length > 512
        )
          throw new Error("INVITATION_INVALID");
        sendJson(
          response,
          200,
          await acceptOrganizationInvitation(
            database.db,
            { id: sessionState.user.id, email: sessionState.user.email },
            body.token,
            requestId,
          ),
        );
        return;
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVITATION_INVALID";
        const status =
          code === "INVITATION_EMAIL_MISMATCH"
            ? 403
            : code === "INVITATION_EXPIRED"
              ? 410
              : 400;
        const message =
          code === "INVITATION_EMAIL_MISMATCH"
            ? "Sign in with the email address that received this invitation."
            : code === "INVITATION_EXPIRED"
              ? "This invitation has expired."
              : "This invitation is invalid or has already been used.";
        sendJson(response, status, { error: { code, message, requestId } });
        return;
      }
    }

    // Privileged JIT Step-Up endpoints
    if (url === "/v1/auth/privileged/step-up" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, {
            error: "Operator authentication required for step-up",
          });
          return;
        }
        const body =
          await parseBody<Omit<StepUpRequest, "operatorId" | "requestId">>(
            request,
          );
        const jitSession = await createJitPrivilegedSession(database.db, {
          operatorId: sessionState.user.id,
          reason: body.reason,
          capabilities: body.capabilities,
          ...(body.approvalReference !== undefined
            ? { approvalReference: body.approvalReference }
            : {}),
          ...(body.breakGlass !== undefined
            ? { breakGlass: body.breakGlass }
            : {}),
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
          requestId,
        });
        sendJson(response, 200, jitSession);
        return;
      } catch (err) {
        sendJson(response, 400, {
          error: err instanceof Error ? err.message : "Step-up failed",
        });
        return;
      }
    }

    if (
      url.startsWith("/v1/auth/privileged/sessions/") &&
      method === "DELETE"
    ) {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const sessionId = url.replace("/v1/auth/privileged/sessions/", "");
        const revoked = await revokeJitPrivilegedSession(
          database.db,
          sessionState.user.id,
          sessionId,
          requestId,
        );
        if (!revoked) {
          sendJson(response, 404, {
            error: "Privileged session not found or already revoked",
          });
          return;
        }
        sendJson(response, 200, {
          success: true,
          message: "Privileged session revoked",
        });
        return;
      } catch (err) {
        sendJson(response, 500, {
          error: err instanceof Error ? err.message : "Internal error",
        });
        return;
      }
    }

    // Fall back to Better Auth Node handler for standard auth endpoints
    const { auth } = await import("./auth");
    return toNodeHandler(auth)(request, response);
  });
}

if (process.env.NODE_ENV !== "test")
  createApp().listen(Number(process.env.PORT ?? 4000));
