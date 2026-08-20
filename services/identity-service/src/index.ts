import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler } from "better-auth/node";
import { loadEnvironment } from "@growx/configuration";
import { createDatabase } from "@growx/database";
import { listUserSessions, revokeUserSession, revokeAllUserSessions, getUserTenantContext } from "./session-management";
import { createJitPrivilegedSession, revokeJitPrivilegedSession } from "./privileged-handler";

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
      sendJson(response, 200, { status: "ok", service: serviceName, timestamp: new Date().toISOString() });
      return;
    }

    const requestId = (request.headers["x-request-id"] as string) ?? `req_${crypto.randomUUID().replace(/-/g, "")}`;

    // Custom Session & Context endpoints
    if (url === "/v1/auth/sessions" && method === "GET") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const sessions = await listUserSessions(database.db, sessionState.user.id, sessionState.session.id);
        sendJson(response, 200, { sessions });
        return;
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Internal error" });
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
        const revoked = await revokeUserSession(database.db, sessionState.user.id, sessionId, requestId);
        if (!revoked) {
          sendJson(response, 404, { error: "Session not found or already revoked" });
          return;
        }
        sendJson(response, 200, { success: true, message: "Session revoked successfully" });
        return;
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Internal error" });
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
        const count = await revokeAllUserSessions(database.db, sessionState.user.id, undefined, requestId);
        sendJson(response, 200, { success: true, revokedCount: count });
        return;
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Internal error" });
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
        const tenantContext = await getUserTenantContext(database.db, sessionState.user.id);
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
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Internal error" });
        return;
      }
    }

    // Privileged JIT Step-Up endpoints
    if (url === "/v1/auth/privileged/step-up" && method === "POST") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Operator authentication required for step-up" });
          return;
        }
        const body = await parseBody<any>(request);
        const jitSession = await createJitPrivilegedSession(database.db, {
          operatorId: sessionState.user.id,
          reason: body.reason,
          capabilities: body.capabilities,
          approvalReference: body.approvalReference,
          breakGlass: body.breakGlass,
          scope: body.scope,
          requestId,
        });
        sendJson(response, 200, jitSession);
        return;
      } catch (err) {
        sendJson(response, 400, { error: err instanceof Error ? err.message : "Step-up failed" });
        return;
      }
    }

    if (url.startsWith("/v1/auth/privileged/sessions/") && method === "DELETE") {
      try {
        const sessionState = await getAuthenticatedUserSession(request);
        if (!sessionState?.user?.id) {
          sendJson(response, 401, { error: "Authentication required" });
          return;
        }
        const sessionId = url.replace("/v1/auth/privileged/sessions/", "");
        const revoked = await revokeJitPrivilegedSession(database.db, sessionState.user.id, sessionId, requestId);
        if (!revoked) {
          sendJson(response, 404, { error: "Privileged session not found or already revoked" });
          return;
        }
        sendJson(response, 200, { success: true, message: "Privileged session revoked" });
        return;
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Internal error" });
        return;
      }
    }

    // Fall back to Better Auth Node handler for standard auth endpoints
    const { auth } = await import("./auth");
    return toNodeHandler(auth)(request, response);
  });
}

if (process.env.NODE_ENV !== "test") createApp().listen(Number(process.env.PORT ?? 4000));
