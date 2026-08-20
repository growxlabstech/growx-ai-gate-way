import type { EventEnvelope } from "@growx/contracts";

export interface CreateOrganizationInput { userId: string; name: string; slug: string; workspaceName: string; workspaceSlug: string; requestId: string; traceId: string; }
export interface CreatedOrganization { organizationId: string; workspaceId: string; environmentId: string; }
export interface OrganizationTransaction {
  createOrganization(input: CreateOrganizationInput): Promise<string>;
  createOwnerMembership(organizationId: string, userId: string): Promise<string>;
  assignOwnerRole(organizationId: string, memberId: string, userId: string): Promise<void>;
  createDefaultWorkspace(organizationId: string, userId: string, name: string, slug: string): Promise<string>;
  createDevelopmentEnvironment(organizationId: string, workspaceId: string): Promise<string>;
  setDefaultEnvironment(organizationId: string, workspaceId: string, environmentId: string): Promise<void>;
  appendAuditEvent(input: { organizationId: string; actorId: string; requestId: string; traceId: string }): Promise<void>;
  appendOutboxEvent(event: EventEnvelope): Promise<void>;
}
export interface TransactionRunner { transaction<T>(operation: (transaction: OrganizationTransaction) => Promise<T>): Promise<T>; }
export async function createOrganization(runner: TransactionRunner, input: CreateOrganizationInput, ids: { organizationId: string; workspaceId: string; environmentId: string; eventId: string }): Promise<CreatedOrganization> {
  return runner.transaction(async (transaction) => {
    const organizationId = await transaction.createOrganization(input);
    const memberId = await transaction.createOwnerMembership(organizationId, input.userId);
    await transaction.assignOwnerRole(organizationId, memberId, input.userId);
    const workspaceId = await transaction.createDefaultWorkspace(organizationId, input.userId, input.workspaceName, input.workspaceSlug);
    const environmentId = await transaction.createDevelopmentEnvironment(organizationId, workspaceId);
    await transaction.setDefaultEnvironment(organizationId, workspaceId, environmentId);
    await transaction.appendAuditEvent({ organizationId, actorId: input.userId, requestId: input.requestId, traceId: input.traceId });
    await transaction.appendOutboxEvent({ id: ids.eventId, type: "organization.created", version: 1, occurredAt: new Date().toISOString(), organizationId, workspaceId, actor: { type: "user", id: input.userId }, data: { name: input.name, slug: input.slug }, metadata: { requestId: input.requestId, traceId: input.traceId } });
    return { organizationId, workspaceId, environmentId };
  });
}
