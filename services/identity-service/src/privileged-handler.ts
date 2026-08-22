import { and, eq, gt, isNull, schema } from "@growx/database";
import {
  privilegedCapabilities,
  type PrivilegedCapability,
} from "@growx/privileged-access";

export interface StepUpRequest {
  operatorId: string;
  reason: string;
  capabilities: PrivilegedCapability[];
  approvalReference?: string;
  breakGlass?: boolean;
  scope?: {
    organizationId?: string;
    workspaceId?: string;
    environmentId?: string;
  };
  requestId: string;
}

export async function createJitPrivilegedSession(db: any, req: StepUpRequest) {
  if (!req.reason || req.reason.trim().length < 10) {
    throw new Error(
      "Privileged access requires a detailed reason (at least 10 characters)",
    );
  }

  if (!req.capabilities || req.capabilities.length === 0) {
    throw new Error("At least one privileged capability must be requested");
  }

  for (const cap of req.capabilities) {
    if (!privilegedCapabilities.includes(cap)) {
      throw new Error(`Invalid privileged capability requested: ${cap}`);
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15-minute JIT TTL
  const sessionId = `psess_${crypto.randomUUID().replace(/-/g, "")}`;

  await db.transaction(async (tx: any) => {
    await tx.insert(schema.privilegedSessions).values({
      id: sessionId,
      operatorId: req.operatorId,
      authenticationStrength: "hardware_key",
      reason: req.reason.trim(),
      approvalReference: req.approvalReference ?? null,
      scope: req.scope ?? {},
      breakGlass: req.breakGlass ?? false,
      authenticatedAt: now,
      expiresAt,
      revokedAt: null,
      createdAt: now,
    });

    for (const cap of req.capabilities) {
      await tx.insert(schema.privilegedSessionCapabilities).values({
        sessionId,
        capability: cap,
      });
    }

    await tx.insert(schema.privilegedAuditEvents).values({
      id: `paud_${crypto.randomUUID().replace(/-/g, "")}`,
      sessionId,
      operatorId: req.operatorId,
      action: "privileged_session.granted",
      resourceType: "privileged_session",
      resourceId: sessionId,
      reason: req.reason.trim(),
      approvalReference: req.approvalReference ?? null,
      requestId: req.requestId,
      result: "allowed",
      metadata: {
        capabilities: req.capabilities,
        breakGlass: req.breakGlass ?? false,
      },
      createdAt: now,
    });
  });

  return {
    privilegedSessionId: sessionId,
    expiresAt,
    capabilities: req.capabilities,
  };
}

export async function revokeJitPrivilegedSession(
  db: any,
  operatorId: string,
  sessionId: string,
  requestId: string,
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(schema.privilegedSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.privilegedSessions.id, sessionId),
        eq(schema.privilegedSessions.operatorId, operatorId),
        isNull(schema.privilegedSessions.revokedAt),
      ),
    )
    .returning({
      id: schema.privilegedSessions.id,
      reason: schema.privilegedSessions.reason,
    });

  if (result.length > 0) {
    await db.insert(schema.privilegedAuditEvents).values({
      id: `paud_${crypto.randomUUID().replace(/-/g, "")}`,
      sessionId,
      operatorId,
      action: "privileged_session.revoked",
      resourceType: "privileged_session",
      resourceId: sessionId,
      reason: "Operator explicit revocation",
      requestId,
      result: "allowed",
      createdAt: now,
    });
    return true;
  }
  return false;
}

export async function validateJitPrivilegedSession(
  db: any,
  sessionId: string,
  operatorId: string,
) {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.privilegedSessions)
    .where(
      and(
        eq(schema.privilegedSessions.id, sessionId),
        eq(schema.privilegedSessions.operatorId, operatorId),
        isNull(schema.privilegedSessions.revokedAt),
        gt(schema.privilegedSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const session = rows[0];

  const caps = await db
    .select({ capability: schema.privilegedSessionCapabilities.capability })
    .from(schema.privilegedSessionCapabilities)
    .where(eq(schema.privilegedSessionCapabilities.sessionId, sessionId));

  return {
    ...session,
    capabilities: caps.map(
      (c: { capability: string }) => c.capability as PrivilegedCapability,
    ),
  };
}
