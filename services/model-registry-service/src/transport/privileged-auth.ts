import type { IncomingMessage } from "node:http";
import type { schema } from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { IModelRegistryEvents } from "../application/events.js";

export type PrivilegedAuthResult =
  | {
      allowed: true;
      operatorId: string;
      sessionId: string;
      capabilities: string[];
    }
  | {
      allowed: false;
      status: number;
      code: string;
      message: string;
    };

export interface IPrivilegedAuthResolver {
  authenticateAndAuthorize(
    req: IncomingMessage,
    requiredCapability: string,
    requestId?: string,
  ): Promise<PrivilegedAuthResult>;
}

function extractPrivilegedToken(req: IncomingMessage): {
  token: string | null;
  error?: string;
} {
  // Check URL query parameters - credential in URL is forbidden
  if (req.url && req.url.includes("?")) {
    const searchParams = new URL(req.url, "http://localhost").searchParams;
    if (
      searchParams.has("jit_token") ||
      searchParams.has("session_token") ||
      searchParams.has("token")
    ) {
      return { token: null, error: "INVALID_CREDENTIAL_LOCATION" };
    }
  }

  // Check header x-jit-session-token
  const jitHeader = req.headers["x-jit-session-token"] as string | undefined;
  if (jitHeader && jitHeader.trim()) {
    return { token: jitHeader.trim() };
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.trim().split(" ");
    if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer") {
      const token = parts[1]!.trim();
      // Machine API keys are explicitly forbidden on the privileged ops plane
      if (
        token.startsWith("gx_live_") ||
        token.startsWith("gx_test_") ||
        token.startsWith("gx_")
      ) {
        return { token: null, error: "INVALID_PRINCIPAL" };
      }
      return { token };
    }
  }

  return { token: null };
}

export class DrizzlePrivilegedAuthResolver implements IPrivilegedAuthResolver {
  constructor(
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly events?: IModelRegistryEvents,
  ) {}

  async authenticateAndAuthorize(
    req: IncomingMessage,
    requiredCapability: string,
    requestId = "req_unknown",
  ): Promise<PrivilegedAuthResult> {
    const { token, error } = extractPrivilegedToken(req);

    if (error === "INVALID_CREDENTIAL_LOCATION") {
      return {
        allowed: false,
        status: 400,
        code: "INVALID_CREDENTIAL_LOCATION",
        message:
          "Privileged credentials must not be passed in URL query parameters",
      };
    }

    if (error === "INVALID_PRINCIPAL") {
      return {
        allowed: false,
        status: 401,
        code: "INVALID_PRINCIPAL",
        message: "Customer API keys cannot authenticate privileged operations",
      };
    }

    if (!token) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message:
          "Privileged JIT session token is required for internal operations",
      };
    }

    // Look up privileged session
    const session = await this.db.query.privilegedSessions.findFirst({
      where: (table, { eq }) => eq(table.id, token),
    });

    if (!session) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Invalid privileged JIT session",
      };
    }

    if (session.revokedAt) {
      return {
        allowed: false,
        status: 401,
        code: "SESSION_REVOKED",
        message: "Privileged session has been revoked",
      };
    }

    if (session.expiresAt <= new Date()) {
      return {
        allowed: false,
        status: 401,
        code: "SESSION_EXPIRED",
        message: "Privileged JIT session has expired",
      };
    }

    // Fetch capabilities
    const capRows = await this.db.query.privilegedSessionCapabilities.findMany({
      where: (table, { eq }) => eq(table.sessionId, session.id),
    });
    const capabilities = capRows.map((c) => c.capability);

    const hasCap =
      capabilities.includes(requiredCapability) ||
      capabilities.includes("ops.*") ||
      capabilities.includes("ops.models.*");

    if (!hasCap) {
      if (this.events) {
        await this.events.emitSecurityEvent(
          "security.privileged.unauthorized_model_access",
          "high",
          {
            operatorId: session.operatorId,
            requiredCapability,
            heldCapabilities: capabilities,
          },
          requestId,
        );
      }

      return {
        allowed: false,
        status: 403,
        code: "FORBIDDEN",
        message: `Privileged session lacks required capability: ${requiredCapability}`,
      };
    }

    return {
      allowed: true,
      operatorId: session.operatorId,
      sessionId: session.id,
      capabilities,
    };
  }
}

export interface RegisteredPrivilegedSession {
  id: string;
  operatorId: string;
  capabilities: string[];
  expiresAt: Date;
  revokedAt?: Date | null;
}

export class InMemoryPrivilegedAuthResolver implements IPrivilegedAuthResolver {
  private readonly sessions = new Map<string, RegisteredPrivilegedSession>();

  constructor(private readonly events?: IModelRegistryEvents) {}

  registerSession(session: RegisteredPrivilegedSession): void {
    this.sessions.set(session.id, { ...session });
  }

  async authenticateAndAuthorize(
    req: IncomingMessage,
    requiredCapability: string,
    requestId = "req_unknown",
  ): Promise<PrivilegedAuthResult> {
    const { token, error } = extractPrivilegedToken(req);

    if (error === "INVALID_CREDENTIAL_LOCATION") {
      return {
        allowed: false,
        status: 400,
        code: "INVALID_CREDENTIAL_LOCATION",
        message:
          "Privileged credentials must not be passed in URL query parameters",
      };
    }

    if (error === "INVALID_PRINCIPAL") {
      return {
        allowed: false,
        status: 401,
        code: "INVALID_PRINCIPAL",
        message: "Customer API keys cannot authenticate privileged operations",
      };
    }

    if (!token) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message:
          "Privileged JIT session token is required for internal operations",
      };
    }

    const session = this.sessions.get(token);
    if (!session) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Invalid privileged JIT session",
      };
    }

    if (session.revokedAt) {
      return {
        allowed: false,
        status: 401,
        code: "SESSION_REVOKED",
        message: "Privileged session has been revoked",
      };
    }

    if (session.expiresAt <= new Date()) {
      return {
        allowed: false,
        status: 401,
        code: "SESSION_EXPIRED",
        message: "Privileged JIT session has expired",
      };
    }

    const hasCap =
      session.capabilities.includes(requiredCapability) ||
      session.capabilities.includes("ops.*") ||
      session.capabilities.includes("ops.models.*");

    if (!hasCap) {
      if (this.events) {
        await this.events.emitSecurityEvent(
          "security.privileged.unauthorized_model_access",
          "high",
          {
            operatorId: session.operatorId,
            requiredCapability,
            heldCapabilities: session.capabilities,
          },
          requestId,
        );
      }

      return {
        allowed: false,
        status: 403,
        code: "FORBIDDEN",
        message: `Privileged session lacks required capability: ${requiredCapability}`,
      };
    }

    return {
      allowed: true,
      operatorId: session.operatorId,
      sessionId: session.id,
      capabilities: session.capabilities,
    };
  }
}
