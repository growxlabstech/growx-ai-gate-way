import { and, createDatabase, eq, schema } from "@growx/database";
import { generateId } from "@growx/ids";
import type { EventEnvelope } from "@growx/contracts";
import type {
  CreateOrganizationInput,
  OrganizationTransaction,
  TransactionRunner,
} from "../application/create-organization.js";

type Database = ReturnType<typeof createDatabase>["db"];

export interface OrganizationIds {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  eventId: string;
}

export class DatabaseOrganizationTransactionRunner implements TransactionRunner {
  constructor(
    private readonly db: Database,
    private readonly ids: OrganizationIds,
  ) {}

  transaction<T>(
    operation: (transaction: OrganizationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const transaction: OrganizationTransaction = {
        createOrganization: async (input: CreateOrganizationInput) => {
          await tx.insert(schema.organizations).values({
            id: this.ids.organizationId,
            name: input.name,
            slug: input.slug,
            status: "active",
            ownerUserId: input.userId,
          });
          return this.ids.organizationId;
        },
        createOwnerMembership: async (organizationId, userId) => {
          const memberId = generateId("omem");
          await tx.insert(schema.organizationMembers).values({
            id: memberId,
            organizationId,
            userId,
            status: "active",
            joinedAt: new Date(),
          });
          return memberId;
        },
        assignOwnerRole: async (organizationId, memberId, userId) => {
          const roleId = generateId("role");
          await tx.insert(schema.roles).values({
            id: roleId,
            organizationId,
            key: "organization_owner",
            name: "Organization Owner",
            builtIn: true,
          });
          await tx
            .insert(schema.memberRoles)
            .values({ organizationId, memberId, roleId, assignedBy: userId });
        },
        createDefaultWorkspace: async (organizationId, userId, name, slug) => {
          await tx.insert(schema.workspaces).values({
            id: this.ids.workspaceId,
            organizationId,
            name,
            slug,
            status: "active",
            createdBy: userId,
          });
          await tx.insert(schema.workspaceMembers).values({
            id: generateId("wmem"),
            organizationId,
            workspaceId: this.ids.workspaceId,
            userId,
            status: "active",
          });
          return this.ids.workspaceId;
        },
        createDevelopmentEnvironment: async (organizationId, workspaceId) => {
          await tx.insert(schema.environments).values({
            id: this.ids.environmentId,
            organizationId,
            workspaceId,
            name: "Development",
            slug: "development",
            type: "development",
            status: "active",
          });
          return this.ids.environmentId;
        },
        setDefaultEnvironment: async (
          _organizationId,
          workspaceId,
          environmentId,
        ) => {
          await tx
            .update(schema.workspaces)
            .set({ defaultEnvironmentId: environmentId })
            .where(eq(schema.workspaces.id, workspaceId));
        },
        appendAuditEvent: async ({
          organizationId,
          actorId,
          requestId,
          traceId,
        }) => {
          await tx.insert(schema.auditEvents).values({
            id: generateId("aud"),
            organizationId,
            actorType: "user",
            actorId,
            action: "organization.created",
            resourceType: "organization",
            resourceId: organizationId,
            requestId,
            traceId,
            metadata: {},
          });
        },
        appendOutboxEvent: async (event: EventEnvelope) => {
          await tx.insert(schema.outbox).values({
            id: event.id,
            topic: event.type,
            organizationId: event.organizationId,
            workspaceId: event.workspaceId,
            payload: event,
          });
        },
      };
      return operation(transaction);
    });
  }
}

export async function findOwnedOrganizationBySlug(
  db: Database,
  userId: string,
  slug: string,
) {
  const rows = await db
    .select({
      organizationId: schema.organizations.id,
      organizationSlug: schema.organizations.slug,
      workspaceId: schema.workspaces.id,
      workspaceSlug: schema.workspaces.slug,
    })
    .from(schema.organizations)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.organizations.ownerUserId, userId),
        eq(schema.organizations.slug, slug),
        eq(schema.organizations.status, "active"),
        eq(schema.workspaces.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
