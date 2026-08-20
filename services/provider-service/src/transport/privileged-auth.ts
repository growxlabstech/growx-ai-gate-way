import type { IncomingMessage, ServerResponse } from "node:http";
import type { IProviderEvents } from "../application/events.js";

export interface PrivilegedOperatorSession {
  sessionId: string;
  operatorId: string;
  operatorEmail: string;
  capabilities: string[];
  expiresAt: Date;
}

export interface IPrivilegedSessionResolver {
  resolveSession(token: string): Promise<PrivilegedOperatorSession | null>;
}

export class InMemoryPrivilegedSessionResolver implements IPrivilegedSessionResolver {
  private readonly sessions = new Map<string, PrivilegedOperatorSession>();

  registerSession(token: string, session: PrivilegedOperatorSession): void {
    this.sessions.set(token, session);
  }

  async resolveSession(token: string): Promise<PrivilegedOperatorSession | null> {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt.getTime() <= Date.now()) return null;
    return s;
  }
}

function hasCapability(session: PrivilegedOperatorSession, requiredCapability: string): boolean {
  if (session.capabilities.includes("*") || session.capabilities.includes(requiredCapability)) {
    return true;
  }

  // Capability aliases
  if (requiredCapability === "ops.providers.manage" || requiredCapability === "ops.providers.write") {
    return session.capabilities.includes("ops.providers.manage") || session.capabilities.includes("ops.providers.write");
  }

  if (
    requiredCapability === "ops.provider_credentials.manage" ||
    requiredCapability === "ops.providers.credentials.manage"
  ) {
    return (
      session.capabilities.includes("ops.provider_credentials.manage") ||
      session.capabilities.includes("ops.providers.credentials.manage")
    );
  }

  if (
    requiredCapability === "ops.provider_credentials.rotate" ||
    requiredCapability === "ops.providers.credentials.manage"
  ) {
    return (
      session.capabilities.includes("ops.provider_credentials.rotate") ||
      session.capabilities.includes("ops.providers.credentials.manage")
    );
  }

  if (
    requiredCapability === "ops.provider_credentials.read" ||
    requiredCapability === "ops.providers.credentials.read"
  ) {
    return (
      session.capabilities.includes("ops.provider_credentials.read") ||
      session.capabilities.includes("ops.providers.credentials.read") ||
      session.capabilities.includes("ops.providers.read")
    );
  }

  return false;
}

export async function requirePrivilegedCapability(
  req: IncomingMessage,
  res: ServerResponse,
  requiredCapability: string,
  sessionResolver: IPrivilegedSessionResolver,
  events?: IProviderEvents
): Promise<{ operatorId: string; session: PrivilegedOperatorSession } | null> {
  const urlObj = new URL(req.url ?? "/", "http://localhost");

  // Reject credential in query params
  if (urlObj.searchParams.has("jit_token") || urlObj.searchParams.has("token") || urlObj.searchParams.has("api_key")) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "INVALID_CREDENTIAL_LOCATION",
          message: "Privileged credentials must only be transmitted in Authorization header",
        },
      })
    );
    return null;
  }

  const authHeader = req.headers["authorization"] ?? "";

  // Reject customer API keys attempting to access /internal/ops plane
  if (authHeader.startsWith("Bearer gx_live_") || authHeader.startsWith("Bearer gx_test_")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "INVALID_PRINCIPAL",
          message: "Customer API keys cannot access privileged provider control plane",
        },
      })
    );
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid privileged authorization token",
        },
      })
    );
    return null;
  }

  const token = authHeader.slice(7).trim();
  const session = await sessionResolver.resolveSession(token);

  if (!session) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid, expired, or revoked privileged session",
        },
      })
    );
    return null;
  }

  if (!hasCapability(session, requiredCapability)) {
    if (events) {
      await events.emitSecurityEvent("security.privileged.unauthorized_provider_access", {
        operatorId: session.operatorId,
        operatorEmail: session.operatorEmail,
        attemptedCapability: requiredCapability,
        availableCapabilities: session.capabilities,
      });
    }

    res.writeHead(403, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "FORBIDDEN",
          message: `Required capability '${requiredCapability}' is not granted to session`,
        },
      })
    );
    return null;
  }

  return { operatorId: session.operatorId, session };
}
