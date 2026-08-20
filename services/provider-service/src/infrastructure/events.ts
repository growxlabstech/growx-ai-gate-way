/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  outbox,
  privilegedAuditEvents,
  securityEvents,
} from "@growx/database";
import { createPublicId } from "@growx/ids";
import type { IProviderEvents } from "../application/events.js";
import { toCredentialMetadata, toProviderRecord } from "../domain/serializers.js";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "../domain/types.js";

export class InMemoryProviderEvents implements IProviderEvents {
  public readonly auditEvents: Array<{ event: string; operatorId: string; data: any; requestId?: string | undefined }> = [];
  public readonly outboxEvents: Array<{ eventType: string; payload: any }> = [];
  public readonly secEvents: Array<{ type: string; data: any; requestId?: string | undefined }> = [];

  async emitProviderCreated(provider: ProviderEntity, operatorId: string, requestId?: string): Promise<void> {
    const record = toProviderRecord(provider);
    this.auditEvents.push({ event: "provider.created", operatorId, data: record, requestId });
    this.outboxEvents.push({ eventType: "provider.created", payload: record });
  }

  async emitProviderUpdated(provider: ProviderEntity, operatorId: string, requestId?: string): Promise<void> {
    const record = toProviderRecord(provider);
    this.auditEvents.push({ event: "provider.updated", operatorId, data: record, requestId });
    this.outboxEvents.push({ eventType: "provider.updated", payload: record });
  }

  async emitProviderDisabled(providerId: string, operatorId: string, requestId?: string): Promise<void> {
    this.auditEvents.push({ event: "provider.disabled", operatorId, data: { providerId }, requestId });
    this.outboxEvents.push({ eventType: "provider.disabled", payload: { providerId } });
  }

  async emitProviderEnabled(providerId: string, operatorId: string, requestId?: string): Promise<void> {
    this.auditEvents.push({ event: "provider.enabled", operatorId, data: { providerId }, requestId });
    this.outboxEvents.push({ eventType: "provider.enabled", payload: { providerId } });
  }

  async emitCredentialCreated(credential: ProviderCredentialEntity, operatorId: string, requestId?: string): Promise<void> {
    const meta = toCredentialMetadata(credential);
    this.auditEvents.push({ event: "provider.credential.created", operatorId, data: meta, requestId });
    this.outboxEvents.push({ eventType: "provider.credential.created", payload: meta });
  }

  async emitCredentialRotated(credential: ProviderCredentialEntity, previousId: string, operatorId: string, requestId?: string): Promise<void> {
    const meta = toCredentialMetadata(credential);
    this.auditEvents.push({ event: "provider.credential.rotated", operatorId, data: { ...meta, previousId }, requestId });
    this.outboxEvents.push({ eventType: "provider.credential.rotated", payload: { ...meta, previousId } });
  }

  async emitCredentialDisabled(credentialId: string, operatorId: string, requestId?: string): Promise<void> {
    this.auditEvents.push({ event: "provider.credential.disabled", operatorId, data: { credentialId }, requestId });
    this.outboxEvents.push({ eventType: "provider.credential.disabled", payload: { credentialId } });
  }

  async emitSecurityEvent(type: string, data: Record<string, unknown>, requestId?: string): Promise<void> {
    this.secEvents.push({ type, data, requestId });
  }
}

export class DrizzleProviderEvents implements IProviderEvents {
  constructor(private readonly db: any) {}

  async emitProviderCreated(provider: ProviderEntity, operatorId: string, requestId?: string): Promise<void> {
    const record = toProviderRecord(provider);
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.create",
      resourceType: "provider",
      resourceId: provider.id,
      metadata: record,
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider",
      aggregateId: provider.id,
      eventType: "provider.created",
      payload: record,
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitProviderUpdated(provider: ProviderEntity, operatorId: string, requestId?: string): Promise<void> {
    const record = toProviderRecord(provider);
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.update",
      resourceType: "provider",
      resourceId: provider.id,
      metadata: record,
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider",
      aggregateId: provider.id,
      eventType: "provider.updated",
      payload: record,
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitProviderDisabled(providerId: string, operatorId: string, requestId?: string): Promise<void> {
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.disable",
      resourceType: "provider",
      resourceId: providerId,
      metadata: { providerId },
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider",
      aggregateId: providerId,
      eventType: "provider.disabled",
      payload: { providerId },
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitProviderEnabled(providerId: string, operatorId: string, requestId?: string): Promise<void> {
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.enable",
      resourceType: "provider",
      resourceId: providerId,
      metadata: { providerId },
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider",
      aggregateId: providerId,
      eventType: "provider.enabled",
      payload: { providerId },
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitCredentialCreated(credential: ProviderCredentialEntity, operatorId: string, requestId?: string): Promise<void> {
    const meta = toCredentialMetadata(credential);
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.credential.create",
      resourceType: "provider_credential",
      resourceId: credential.id,
      metadata: meta,
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider_credential",
      aggregateId: credential.id,
      eventType: "provider.credential.created",
      payload: meta,
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitCredentialRotated(credential: ProviderCredentialEntity, previousId: string, operatorId: string, requestId?: string): Promise<void> {
    const meta = toCredentialMetadata(credential);
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.credential.rotate",
      resourceType: "provider_credential",
      resourceId: credential.id,
      metadata: { ...meta, previousId },
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider_credential",
      aggregateId: credential.id,
      eventType: "provider.credential.rotated",
      payload: { ...meta, previousId },
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitCredentialDisabled(credentialId: string, operatorId: string, requestId?: string): Promise<void> {
    const reqId = requestId ?? createPublicId("req");
    const traceId = createPublicId("trace");

    await this.db.insert(privilegedAuditEvents).values({
      id: createPublicId("audit"),
      operatorId,
      action: "provider.credential.disable",
      resourceType: "provider_credential",
      resourceId: credentialId,
      metadata: { credentialId },
      createdAt: new Date(),
    });

    await this.db.insert(outbox).values({
      id: createPublicId("evt"),
      aggregateType: "provider_credential",
      aggregateId: credentialId,
      eventType: "provider.credential.disabled",
      payload: { credentialId },
      metadata: { requestId: reqId, traceId },
      status: "pending",
      createdAt: new Date(),
    });
  }

  async emitSecurityEvent(type: string, data: Record<string, unknown>, requestId?: string): Promise<void> {
    const reqId = requestId ?? createPublicId("req");
    await this.db.insert(securityEvents).values({
      id: createPublicId("sec"),
      eventType: type,
      severity: "high",
      payload: data,
      metadata: { requestId: reqId },
      createdAt: new Date(),
    });
  }
}
