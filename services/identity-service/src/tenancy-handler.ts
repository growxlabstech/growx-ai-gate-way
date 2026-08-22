import { and, createDatabase, eq, gt, isNull, schema } from "@growx/database";
import {
  createOrganizationSchema,
  createWorkspaceSchema,
  type BuiltInRole,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import {
  canAcceptInvitation,
  createOrganization,
  DatabaseOrganizationTransactionRunner,
  findOwnedOrganizationBySlug,
} from "@growx/organization-service";
import { hasPermission } from "@growx/authorization-service";
import { createHash } from "node:crypto";

type Database = ReturnType<typeof createDatabase>["db"];

export async function createFirstOrganization(
  db: Database,
  userId: string,
  rawInput: unknown,
  requestId: string,
) {
  const input = createOrganizationSchema.parse(rawInput);
  const existingMembership = await db
    .select({
      organizationId: schema.organizations.id,
      organizationSlug: schema.organizations.slug,
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
    )
    .limit(1);
  if (existingMembership[0]) {
    const workspace = await db
      .select({
        workspaceId: schema.workspaces.id,
        workspaceSlug: schema.workspaces.slug,
      })
      .from(schema.workspaces)
      .where(
        and(
          eq(
            schema.workspaces.organizationId,
            existingMembership[0].organizationId,
          ),
          eq(schema.workspaces.status, "active"),
        ),
      )
      .limit(1);
    if (workspace[0])
      return { ...existingMembership[0], ...workspace[0], replayed: true };
    throw new Error("ORGANIZATION_ALREADY_EXISTS");
  }

  const ids = {
    organizationId: generateId("org"),
    workspaceId: generateId("ws"),
    environmentId: generateId("env"),
    eventId: generateId("evt"),
  };
  const runner = new DatabaseOrganizationTransactionRunner(db, ids);
  try {
    await createOrganization(
      runner,
      {
        userId,
        name: input.name,
        slug: input.slug,
        workspaceName: input.workspaceName,
        workspaceSlug: input.workspaceSlug,
        requestId,
        traceId: generateId("trace"),
      },
      ids,
    );
    return {
      organizationId: ids.organizationId,
      organizationSlug: input.slug,
      workspaceId: ids.workspaceId,
      workspaceSlug: input.workspaceSlug,
      replayed: false,
    };
  } catch (error) {
    const existing = await findOwnedOrganizationBySlug(db, userId, input.slug);
    if (existing) return { ...existing, replayed: true };
    throw error;
  }
}

export async function createFirstWorkspace(
  db: Database,
  userId: string,
  organizationId: string,
  rawInput: unknown,
  requestId: string,
) {
  const input = createWorkspaceSchema.parse(rawInput);
  const memberships = await db
    .select({
      memberId: schema.organizationMembers.id,
      organizationStatus: schema.organizations.status,
      role: schema.roles.key,
    })
    .from(schema.organizationMembers)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organizationMembers.organizationId),
    )
    .innerJoin(
      schema.memberRoles,
      eq(schema.memberRoles.memberId, schema.organizationMembers.id),
    )
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberRoles.roleId))
    .where(
      and(
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizationMembers.status, "active"),
      ),
    )
    .limit(10);
  const allowed = memberships.some((membership) =>
    hasPermission(
      {
        userId,
        organizationId,
        accountStatus: "active",
        organizationStatus: membership.organizationStatus,
        roles: [membership.role as BuiltInRole],
      },
      "workspace.create",
    ),
  );
  if (!allowed) throw new Error("WORKSPACE_CREATE_DENIED");

  const existing = await db
    .select({
      organizationId: schema.workspaces.organizationId,
      organizationSlug: schema.organizations.slug,
      workspaceId: schema.workspaces.id,
      workspaceSlug: schema.workspaces.slug,
    })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.workspaceMembers.workspaceId),
    )
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.workspaces.organizationId),
    )
    .where(
      and(
        eq(schema.workspaceMembers.organizationId, organizationId),
        eq(schema.workspaceMembers.userId, userId),
        eq(schema.workspaceMembers.status, "active"),
        eq(schema.workspaces.status, "active"),
      ),
    )
    .limit(1);
  if (existing[0]) return { ...existing[0], replayed: true };

  const workspaceId = generateId("ws");
  const environmentId = generateId("env");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.workspaces).values({
        id: workspaceId,
        organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        region: input.region,
        status: "active",
        createdBy: userId,
      });
      await tx.insert(schema.workspaceMembers).values({
        id: generateId("wmem"),
        organizationId,
        workspaceId,
        userId,
        status: "active",
      });
      await tx.insert(schema.environments).values({
        id: environmentId,
        organizationId,
        workspaceId,
        name: "Development",
        slug: "development",
        type: "development",
        status: "active",
      });
      await tx
        .update(schema.workspaces)
        .set({ defaultEnvironmentId: environmentId })
        .where(eq(schema.workspaces.id, workspaceId));
      await tx.insert(schema.auditEvents).values({
        id: generateId("aud"),
        organizationId,
        workspaceId,
        actorType: "user",
        actorId: userId,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: workspaceId,
        requestId,
        traceId: generateId("trace"),
        metadata: {},
      });
      await tx.insert(schema.outbox).values({
        id: generateId("evt"),
        topic: "workspace.created",
        organizationId,
        workspaceId,
        payload: {
          type: "workspace.created",
          organizationId,
          workspaceId,
          actor: { type: "user", id: userId },
          metadata: { requestId },
        },
      });
    });
    const organization = await db
      .select({ organizationSlug: schema.organizations.slug })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    return {
      organizationId,
      organizationSlug: organization[0]?.organizationSlug ?? "",
      workspaceId,
      workspaceSlug: input.slug,
      replayed: false,
    };
  } catch (error) {
    const raced = await db
      .select({
        organizationId: schema.workspaces.organizationId,
        organizationSlug: schema.organizations.slug,
        workspaceId: schema.workspaces.id,
        workspaceSlug: schema.workspaces.slug,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaces.id, schema.workspaceMembers.workspaceId),
      )
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.workspaces.organizationId),
      )
      .where(
        and(
          eq(schema.workspaceMembers.organizationId, organizationId),
          eq(schema.workspaceMembers.userId, userId),
          eq(schema.workspaceMembers.status, "active"),
          eq(schema.workspaces.status, "active"),
        ),
      )
      .limit(1);
    if (raced[0]) return { ...raced[0], replayed: true };
    throw error;
  }
}

export async function acceptOrganizationInvitation(
  db: Database,
  user: { id: string; email: string },
  token: string,
  requestId: string,
) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.organizationInvitations)
      .where(eq(schema.organizationInvitations.tokenHash, tokenHash))
      .limit(1);
    const invitation = rows[0];
    if (!invitation || !canAcceptInvitation(invitation))
      throw new Error(
        invitation?.expiresAt && invitation.expiresAt <= new Date()
          ? "INVITATION_EXPIRED"
          : "INVITATION_INVALID",
      );
    if (
      invitation.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
    )
      throw new Error("INVITATION_EMAIL_MISMATCH");

    const claimed = await tx
      .update(schema.organizationInvitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.organizationInvitations.id, invitation.id),
          eq(schema.organizationInvitations.tokenHash, tokenHash),
          isNull(schema.organizationInvitations.acceptedAt),
          isNull(schema.organizationInvitations.revokedAt),
          gt(schema.organizationInvitations.expiresAt, new Date()),
        ),
      )
      .returning({ id: schema.organizationInvitations.id });
    if (!claimed[0]) throw new Error("INVITATION_INVALID");

    const existingMembers = await tx
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(
            schema.organizationMembers.organizationId,
            invitation.organizationId,
          ),
          eq(schema.organizationMembers.userId, user.id),
        ),
      )
      .limit(1);
    const memberId = existingMembers[0]?.id ?? generateId("omem");
    if (existingMembers[0])
      await tx
        .update(schema.organizationMembers)
        .set({ status: "active", joinedAt: new Date() })
        .where(eq(schema.organizationMembers.id, memberId));
    else
      await tx.insert(schema.organizationMembers).values({
        id: memberId,
        organizationId: invitation.organizationId,
        userId: user.id,
        status: "active",
        joinedAt: new Date(),
        invitedBy: invitation.invitedBy,
      });
    await tx
      .insert(schema.memberRoles)
      .values({
        organizationId: invitation.organizationId,
        memberId,
        roleId: invitation.roleId,
        assignedBy: invitation.invitedBy,
      })
      .onConflictDoNothing();

    const workspaceRows = await tx
      .select({
        workspaceId: schema.workspaces.id,
        workspaceSlug: schema.workspaces.slug,
        organizationSlug: schema.organizations.slug,
      })
      .from(schema.workspaces)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.workspaces.organizationId),
      )
      .where(
        and(
          eq(schema.workspaces.organizationId, invitation.organizationId),
          eq(schema.workspaces.status, "active"),
        ),
      )
      .limit(1);
    const workspace = workspaceRows[0];
    if (workspace)
      await tx
        .insert(schema.workspaceMembers)
        .values({
          id: generateId("wmem"),
          organizationId: invitation.organizationId,
          workspaceId: workspace.workspaceId,
          userId: user.id,
          status: "active",
        })
        .onConflictDoNothing();

    await tx.insert(schema.auditEvents).values({
      id: generateId("aud"),
      organizationId: invitation.organizationId,
      workspaceId: workspace?.workspaceId,
      actorType: "user",
      actorId: user.id,
      action: "organization.invitation.accepted",
      resourceType: "organization_invitation",
      resourceId: invitation.id,
      requestId,
      traceId: generateId("trace"),
      metadata: {},
    });
    await tx.insert(schema.outbox).values({
      id: generateId("evt"),
      topic: "organization.member.joined",
      organizationId: invitation.organizationId,
      workspaceId: workspace?.workspaceId,
      payload: {
        type: "organization.member.joined",
        organizationId: invitation.organizationId,
        workspaceId: workspace?.workspaceId ?? null,
        actor: { type: "user", id: user.id },
        data: { invitationId: invitation.id },
        metadata: { requestId },
      },
    });
    return {
      organizationId: invitation.organizationId,
      organizationSlug: workspace?.organizationSlug ?? "",
      workspaceId: workspace?.workspaceId ?? null,
      workspaceSlug: workspace?.workspaceSlug ?? null,
    };
  });
}
