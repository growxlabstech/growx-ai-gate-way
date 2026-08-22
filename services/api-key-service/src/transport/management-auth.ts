import type { IncomingMessage } from "node:http";
import type { BuiltInRole, Permission } from "@growx/contracts";
import {
  hasPermission,
  type AuthorizationContext,
} from "@growx/authorization-service";
import { hashToken } from "@growx/cryptography";
import { and, eq, gt, isNull, schema } from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface ManagementPrincipal {
  userId: string;
  userStatus: "active" | "invited" | "suspended" | "disabled" | "deleted";
  organizationId: string;
  workspaceId: string;
  roles: BuiltInRole[];
}

export type ManagementAuthErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ORGANIZATION_NOT_FOUND"
  | "WORKSPACE_NOT_FOUND"
  | "ORGANIZATION_SUSPENDED"
  | "WORKSPACE_SUSPENDED"
  | "USER_SUSPENDED"
  | "INVALID_PRINCIPAL"
  | "INVALID_CREDENTIAL_LOCATION";

export interface ManagementAuthResult {
  allowed: boolean;
  principal?: ManagementPrincipal;
  status: 200 | 400 | 401 | 403 | 404;
  code: ManagementAuthErrorCode | "OK";
  message: string;
}

export interface ManagementAuthResolver {
  authenticateAndAuthorize(
    req: IncomingMessage,
    context: {
      organizationId: string;
      workspaceId: string;
      permission: Permission;
    },
  ): Promise<ManagementAuthResult>;
}

export function extractSessionToken(req: IncomingMessage): {
  token?: string;
  isApiKey?: boolean;
  inQuery?: boolean;
} {
  const url = req.url ?? "";
  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    const searchParams = new URLSearchParams(url.slice(queryIndex));
    if (
      searchParams.has("token") ||
      searchParams.has("session") ||
      searchParams.has("session_token") ||
      searchParams.has("key") ||
      searchParams.has("apiKey") ||
      searchParams.has("api_key")
    ) {
      return { inQuery: true };
    }
  }

  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string") {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^bearer$/i.test(parts[0]!)) {
      const token = parts[1]!;
      if (
        token.startsWith("gx_live_") ||
        token.startsWith("gx_test_") ||
        token.startsWith("gx_")
      ) {
        return { isApiKey: true };
      }
      return { token };
    }
  }

  const cookieHeader = req.headers["cookie"];
  if (typeof cookieHeader === "string") {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, val] = cookie.split("=");
      if (name && val) {
        const cleanName = name.trim();
        if (
          cleanName === "better-auth.session_token" ||
          cleanName === "__Secure-better-auth.session_token" ||
          cleanName === "session_token"
        ) {
          const rawVal = decodeURIComponent(val.trim());
          if (rawVal.startsWith("gx_live_") || rawVal.startsWith("gx_test_")) {
            return { isApiKey: true };
          }
          return { token: rawVal };
        }
      }
    }
  }

  const sessionHeader = req.headers["x-session-token"];
  if (typeof sessionHeader === "string" && sessionHeader.trim()) {
    const token = sessionHeader.trim();
    if (token.startsWith("gx_live_") || token.startsWith("gx_test_")) {
      return { isApiKey: true };
    }
    return { token };
  }

  return {};
}

export class DrizzleManagementAuthResolver implements ManagementAuthResolver {
  constructor(
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly sessionPepper: string,
  ) {}

  async authenticateAndAuthorize(
    req: IncomingMessage,
    context: {
      organizationId: string;
      workspaceId: string;
      permission: Permission;
    },
  ): Promise<ManagementAuthResult> {
    const extraction = extractSessionToken(req);

    if (extraction.inQuery) {
      return {
        allowed: false,
        status: 400,
        code: "INVALID_CREDENTIAL_LOCATION",
        message: "Credentials must not be transmitted in query parameters",
      };
    }

    if (extraction.isApiKey) {
      return {
        allowed: false,
        status: 401,
        code: "INVALID_PRINCIPAL",
        message:
          "API keys cannot be used to manage API keys. Human authentication required.",
      };
    }

    if (!extraction.token) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication required to access management plane",
      };
    }

    const tokenHash = hashToken(extraction.token, this.sessionPepper);
    const now = new Date();

    // 1. Authenticate human session
    const sessionRows = await this.db
      .select({
        sessionId: schema.sessions.id,
        userId: schema.sessions.userId,
        expiresAt: schema.sessions.expiresAt,
        revokedAt: schema.sessions.revokedAt,
        userStatus: schema.users.status,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(
        and(
          eq(schema.sessions.tokenHash, tokenHash),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (sessionRows.length === 0) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Invalid, expired, or revoked session",
      };
    }

    const userSession = sessionRows[0]!;
    if (userSession.userStatus !== "active") {
      return {
        allowed: false,
        status: 403,
        code: "USER_SUSPENDED",
        message: `User account is ${userSession.userStatus}`,
      };
    }

    // 2. Validate Organization Tenancy
    const orgRows = await this.db
      .select({
        id: schema.organizations.id,
        status: schema.organizations.status,
        ownerUserId: schema.organizations.ownerUserId,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, context.organizationId))
      .limit(1);

    if (orgRows.length === 0) {
      return {
        allowed: false,
        status: 404,
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
      };
    }

    const org = orgRows[0]!;
    if (org.status === "suspended" || org.status === "archived") {
      return {
        allowed: false,
        status: 403,
        code: "ORGANIZATION_SUSPENDED",
        message: `Organization is ${org.status}`,
      };
    }

    // 3. Validate Workspace Tenancy
    const wsRows = await this.db
      .select({
        id: schema.workspaces.id,
        status: schema.workspaces.status,
        organizationId: schema.workspaces.organizationId,
      })
      .from(schema.workspaces)
      .where(
        and(
          eq(schema.workspaces.id, context.workspaceId),
          eq(schema.workspaces.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (wsRows.length === 0) {
      return {
        allowed: false,
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found in this organization",
      };
    }

    const workspace = wsRows[0]!;
    if (workspace.status !== "active") {
      return {
        allowed: false,
        status: 403,
        code: "WORKSPACE_SUSPENDED",
        message: `Workspace is ${workspace.status}`,
      };
    }

    // 4. Resolve Roles
    const userRoles: BuiltInRole[] = [];
    if (org.ownerUserId === userSession.userId) {
      userRoles.push("organization_owner");
    } else {
      const memberRows = await this.db
        .select({
          memberId: schema.organizationMembers.id,
          memberStatus: schema.organizationMembers.status,
        })
        .from(schema.organizationMembers)
        .where(
          and(
            eq(
              schema.organizationMembers.organizationId,
              context.organizationId,
            ),
            eq(schema.organizationMembers.userId, userSession.userId),
            eq(schema.organizationMembers.status, "active"),
          ),
        )
        .limit(1);

      if (memberRows.length === 0) {
        return {
          allowed: false,
          status: 403,
          code: "FORBIDDEN",
          message: "User is not an active member of this organization",
        };
      }

      const member = memberRows[0]!;
      const roleAssignments = await this.db
        .select({
          roleKey: schema.roles.key,
          roleName: schema.roles.name,
        })
        .from(schema.memberRoles)
        .innerJoin(schema.roles, eq(schema.memberRoles.roleId, schema.roles.id))
        .where(
          and(
            eq(schema.memberRoles.organizationId, context.organizationId),
            eq(schema.memberRoles.memberId, member.memberId),
          ),
        );

      for (const ra of roleAssignments) {
        const key = ra.roleKey || ra.roleName;
        if (
          key === "organization_owner" ||
          key === "organization_admin" ||
          key === "developer" ||
          key === "billing_manager" ||
          key === "viewer"
        ) {
          userRoles.push(key as BuiltInRole);
        }
      }
    }

    // 5. Evaluate Phase-2 Authorization
    const authContext: AuthorizationContext = {
      userId: userSession.userId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      accountStatus: userSession.userStatus,
      organizationStatus: org.status,
      workspaceStatus: workspace.status,
      roles: userRoles,
    };

    const permitted = hasPermission(authContext, context.permission);
    if (!permitted) {
      return {
        allowed: false,
        status: 403,
        code: "FORBIDDEN",
        message: `User lacks required capability: ${context.permission}`,
      };
    }

    return {
      allowed: true,
      status: 200,
      code: "OK",
      message: "Authorized",
      principal: {
        userId: userSession.userId,
        userStatus: userSession.userStatus as ManagementPrincipal["userStatus"],
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        roles: userRoles,
      },
    };
  }
}

export interface InMemoryUserSession {
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userStatus: "active" | "invited" | "suspended" | "disabled" | "deleted";
}

export interface InMemoryMembership {
  userId: string;
  organizationId: string;
  workspaceIds?: string[];
  roles: BuiltInRole[];
  status: "active" | "invited" | "suspended" | "removed";
}

export interface InMemoryOrg {
  id: string;
  status: "active" | "trial" | "restricted" | "suspended" | "archived";
  ownerUserId: string;
}

export interface InMemoryWorkspace {
  id: string;
  organizationId: string;
  status: "active" | "restricted" | "suspended" | "archived";
}

export class InMemoryManagementAuthResolver implements ManagementAuthResolver {
  private readonly sessions = new Map<string, InMemoryUserSession>();
  private readonly organizations = new Map<string, InMemoryOrg>();
  private readonly workspaces = new Map<string, InMemoryWorkspace>();
  private readonly memberships = new Map<string, InMemoryMembership>();

  constructor() {}

  registerSession(session: InMemoryUserSession): void {
    this.sessions.set(session.token, session);
  }

  registerOrganization(org: InMemoryOrg): void {
    this.organizations.set(org.id, org);
  }

  registerWorkspace(ws: InMemoryWorkspace): void {
    this.workspaces.set(ws.id, ws);
  }

  registerMembership(membership: InMemoryMembership): void {
    const key = `${membership.organizationId}:${membership.userId}`;
    this.memberships.set(key, membership);
  }

  async authenticateAndAuthorize(
    req: IncomingMessage,
    context: {
      organizationId: string;
      workspaceId: string;
      permission: Permission;
    },
  ): Promise<ManagementAuthResult> {
    const extraction = extractSessionToken(req);

    if (extraction.inQuery) {
      return {
        allowed: false,
        status: 400,
        code: "INVALID_CREDENTIAL_LOCATION",
        message: "Credentials must not be transmitted in query parameters",
      };
    }

    if (extraction.isApiKey) {
      return {
        allowed: false,
        status: 401,
        code: "INVALID_PRINCIPAL",
        message:
          "API keys cannot be used to manage API keys. Human authentication required.",
      };
    }

    if (!extraction.token) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication required to access management plane",
      };
    }

    const session = this.sessions.get(extraction.token);
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return {
        allowed: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Invalid, expired, or revoked session",
      };
    }

    if (session.userStatus !== "active") {
      return {
        allowed: false,
        status: 403,
        code: "USER_SUSPENDED",
        message: `User account is ${session.userStatus}`,
      };
    }

    const org = this.organizations.get(context.organizationId);
    if (!org) {
      return {
        allowed: false,
        status: 404,
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
      };
    }

    if (org.status === "suspended" || org.status === "archived") {
      return {
        allowed: false,
        status: 403,
        code: "ORGANIZATION_SUSPENDED",
        message: `Organization is ${org.status}`,
      };
    }

    const ws = this.workspaces.get(context.workspaceId);
    if (!ws || ws.organizationId !== context.organizationId) {
      return {
        allowed: false,
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found in this organization",
      };
    }

    if (ws.status !== "active") {
      return {
        allowed: false,
        status: 403,
        code: "WORKSPACE_SUSPENDED",
        message: `Workspace is ${ws.status}`,
      };
    }

    const userRoles: BuiltInRole[] = [];
    if (org.ownerUserId === session.userId) {
      userRoles.push("organization_owner");
    } else {
      const membershipKey = `${context.organizationId}:${session.userId}`;
      const membership = this.memberships.get(membershipKey);
      if (!membership || membership.status !== "active") {
        return {
          allowed: false,
          status: 403,
          code: "FORBIDDEN",
          message: "User is not an active member of this organization",
        };
      }
      if (
        membership.workspaceIds &&
        !membership.workspaceIds.includes(context.workspaceId)
      ) {
        return {
          allowed: false,
          status: 403,
          code: "FORBIDDEN",
          message: "User is not an active member of this workspace",
        };
      }
      userRoles.push(...membership.roles);
    }

    const authContext: AuthorizationContext = {
      userId: session.userId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      accountStatus: session.userStatus,
      organizationStatus: org.status,
      workspaceStatus: ws.status,
      roles: userRoles,
    };

    const permitted = hasPermission(authContext, context.permission);
    if (!permitted) {
      return {
        allowed: false,
        status: 403,
        code: "FORBIDDEN",
        message: `User lacks required capability: ${context.permission}`,
      };
    }

    return {
      allowed: true,
      status: 200,
      code: "OK",
      message: "Authorized",
      principal: {
        userId: session.userId,
        userStatus: session.userStatus,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        roles: userRoles,
      },
    };
  }
}
