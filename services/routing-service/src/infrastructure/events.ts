import { outbox, securityEvents, type schema } from "@growx/database";
import { createPublicId } from "@growx/ids";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { IRoutingEvents } from "../application/events.js";
import type { RoutingPolicy } from "../domain/types.js";

export class InMemoryRoutingEvents implements IRoutingEvents {
  public createdEvents: Array<{ policy: RoutingPolicy; actorId?: string | undefined }> = [];
  public updatedEvents: Array<{ policy: RoutingPolicy; actorId?: string | undefined }> = [];
  public disabledEvents: Array<{ policyId: string; actorId?: string | undefined }> = [];
  public globalUpdatedEvents: Array<{ policy: RoutingPolicy; actorId?: string | undefined }> = [];
  public securityEvents: Array<{
    type: string;
    data: Record<string, unknown>;
    requestId?: string | undefined;
  }> = [];

  async emitPolicyCreated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    this.createdEvents.push({ policy: { ...policy }, actorId });
  }

  async emitPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    this.updatedEvents.push({ policy: { ...policy }, actorId });
  }

  async emitPolicyDisabled(
    policyId: string,
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    this.disabledEvents.push({ policyId, actorId });
  }

  async emitGlobalPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    this.globalUpdatedEvents.push({ policy: { ...policy }, actorId });
  }

  async emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void> {
    this.securityEvents.push({ type, data, requestId });
  }

  clear(): void {
    this.createdEvents = [];
    this.updatedEvents = [];
    this.disabledEvents = [];
    this.globalUpdatedEvents = [];
    this.securityEvents = [];
  }
}

export class DrizzleRoutingEvents implements IRoutingEvents {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async emitPolicyCreated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      organizationId: policy.organizationId || null,
      workspaceId: policy.workspaceId || null,
      topic: "routing.policy.created",
      payload: {
        policyId: policy.id,
        strategy: policy.strategy,
        version: policy.version,
        actorId,
      },
      createdAt: new Date(),
    });
  }

  async emitPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      organizationId: policy.organizationId || null,
      workspaceId: policy.workspaceId || null,
      topic: "routing.policy.updated",
      payload: {
        policyId: policy.id,
        strategy: policy.strategy,
        version: policy.version,
        actorId,
      },
      createdAt: new Date(),
    });
  }

  async emitPolicyDisabled(
    policyId: string,
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      organizationId: organizationId || null,
      workspaceId: workspaceId || null,
      topic: "routing.policy.disabled",
      payload: { policyId, actorId },
      createdAt: new Date(),
    });
  }

  async emitGlobalPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void> {
    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      organizationId: null,
      workspaceId: null,
      topic: "routing.global.updated",
      payload: {
        strategy: policy.strategy,
        version: policy.version,
        actorId,
      },
      createdAt: new Date(),
    });
  }

  async emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void> {
    await this.db.insert(securityEvents).values({
      id: createPublicId("sec"),
      type,
      severity: "warn",
      requestId: requestId || createPublicId("req"),
      userId: (data.userId as string) || null,
      organizationId: (data.organizationId as string) || null,
      metadata: data,
      createdAt: new Date(),
    });
  }
}
