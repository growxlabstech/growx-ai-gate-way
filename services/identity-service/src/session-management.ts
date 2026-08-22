import { and, eq, gt, isNull, ne, schema } from "@growx/database";

export interface SessionMetadata {
  id: string;
  browser: string;
  ipAddress: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Device";
  let os = "Desktop";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let browser = "Browser";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/"))
    browser = "Safari";

  return `${browser} on ${os}`;
}

export async function listUserSessions(
  db: any,
  userId: string,
  currentSessionId: string,
): Promise<SessionMetadata[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, now),
      ),
    );

  return rows.map((s: any) => ({
    id: s.id,
    browser: parseUserAgent(s.userAgent),
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === currentSessionId,
  }));
}

export async function revokeUserSession(
  db: any,
  userId: string,
  sessionIdToRevoke: string,
  requestId: string,
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(schema.sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.sessions.id, sessionIdToRevoke),
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
      ),
    )
    .returning({ id: schema.sessions.id });

  if (result.length > 0) {
    await db.insert(schema.auditEvents).values({
      id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
      actorType: "user",
      actorId: userId,
      action: "identity.session.revoked",
      resourceType: "session",
      resourceId: sessionIdToRevoke,
      requestId,
      createdAt: now,
      metadata: { sessionId: sessionIdToRevoke },
    });
    return true;
  }
  return false;
}

export async function revokeAllUserSessions(
  db: any,
  userId: string,
  currentSessionIdToKeep: string | undefined,
  requestId: string,
): Promise<number> {
  const now = new Date();
  const conditions = [
    eq(schema.sessions.userId, userId),
    isNull(schema.sessions.revokedAt),
  ];
  if (currentSessionIdToKeep) {
    conditions.push(ne(schema.sessions.id, currentSessionIdToKeep));
  }

  const result = await db
    .update(schema.sessions)
    .set({ revokedAt: now })
    .where(and(...conditions))
    .returning({ id: schema.sessions.id });

  if (result.length > 0) {
    await db.insert(schema.auditEvents).values({
      id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
      actorType: "user",
      actorId: userId,
      action: "identity.session.revoked_all",
      resourceType: "user",
      resourceId: userId,
      requestId,
      createdAt: now,
      metadata: {
        revokedCount: result.length,
        keptSessionId: currentSessionIdToKeep ?? null,
      },
    });
  }

  return result.length;
}

export async function getUserTenantContext(db: any, userId: string) {
  const userRows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      avatarUrl: schema.users.avatarUrl,
      status: schema.users.status,
      locale: schema.users.locale,
      timezone: schema.users.timezone,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (userRows.length === 0) return null;
  const user = userRows[0];

  const orgMemberships = await db
    .select({
      organizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      status: schema.organizationMembers.status,
    })
    .from(schema.organizationMembers)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMembers.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizationMembers.status, "active"),
        eq(schema.organizations.status, "active"),
      ),
    );

  const workspaceMemberships = await db
    .select({
      workspaceId: schema.workspaces.id,
      workspaceName: schema.workspaces.name,
      workspaceSlug: schema.workspaces.slug,
      organizationId: schema.workspaces.organizationId,
      status: schema.workspaceMembers.status,
    })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
    )
    .where(
      and(
        eq(schema.workspaceMembers.userId, userId),
        eq(schema.workspaces.status, "active"),
      ),
    );

  return {
    user,
    organizations: orgMemberships,
    workspaces: workspaceMemberships,
  };
}
