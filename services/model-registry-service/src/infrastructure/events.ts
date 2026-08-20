import { type schema } from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createPublicId } from "@growx/ids";
import type { IModelRegistryEvents } from "../application/events.js";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "../domain/types.js";

export class DrizzleModelRegistryEvents implements IModelRegistryEvents {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  private async emitOutbox(
    topic: string,
    payload: Record<string, unknown>,
    operatorId: string,
    requestId?: string
  ): Promise<void> {
    const reqId = requestId ?? `req_${createPublicId("model").slice(6)}`;
    const evtId = `evt_${createPublicId("model").slice(4)}`;

    await (this.db as any).insert((this.db as any).schema.outbox).values({
      id: evtId,
      topic,
      payload: {
        id: evtId,
        type: topic,
        version: 1,
        occurredAt: new Date().toISOString(),
        actor: { type: "admin", id: operatorId },
        data: payload,
        metadata: { requestId: reqId, traceId: reqId },
      },
      attempts: 0,
      createdAt: new Date(),
    });
  }

  private async emitPrivilegedAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    operatorId: string,
    metadata: Record<string, unknown>,
    requestId?: string
  ): Promise<void> {
    const reqId = requestId ?? `req_${createPublicId("model").slice(6)}`;
    const auditId = `aud_${createPublicId("model").slice(4)}`;

    await (this.db as any).insert((this.db as any).schema.privilegedAuditEvents).values({
      id: auditId,
      sessionId: `psess_${operatorId}`,
      operatorId,
      action,
      resourceType,
      resourceId,
      reason: "Model registry administration",
      requestId: reqId,
      result: "success",
      metadata,
      createdAt: new Date(),
    });
  }

  async emitModelCreated(model: CanonicalModelEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.created", { modelId: model.id, canonicalId: model.canonicalId }, operatorId, requestId);
    await this.emitPrivilegedAudit("create", "canonical_model", model.id, operatorId, { canonicalId: model.canonicalId }, requestId);
  }

  async emitModelUpdated(model: CanonicalModelEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.updated", { modelId: model.id, canonicalId: model.canonicalId }, operatorId, requestId);
    await this.emitPrivilegedAudit("update", "canonical_model", model.id, operatorId, { canonicalId: model.canonicalId }, requestId);
  }

  async emitModelDisabled(modelId: string, canonicalId: string, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.disabled", { modelId, canonicalId }, operatorId, requestId);
    await this.emitPrivilegedAudit("disable", "canonical_model", modelId, operatorId, { canonicalId }, requestId);
  }

  async emitModelDeprecated(model: CanonicalModelEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.deprecated", { modelId: model.id, canonicalId: model.canonicalId }, operatorId, requestId);
    await this.emitPrivilegedAudit("deprecate", "canonical_model", model.id, operatorId, { canonicalId: model.canonicalId }, requestId);
  }

  async emitModelRetired(modelId: string, canonicalId: string, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.retired", { modelId, canonicalId }, operatorId, requestId);
    await this.emitPrivilegedAudit("retire", "canonical_model", modelId, operatorId, { canonicalId }, requestId);
  }

  async emitRouteCreated(route: ProviderRouteEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.route.created", { routeId: route.id, modelId: route.modelId }, operatorId, requestId);
    await this.emitPrivilegedAudit("create", "provider_route", route.id, operatorId, { modelId: route.modelId }, requestId);
  }

  async emitRouteUpdated(route: ProviderRouteEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.route.updated", { routeId: route.id, modelId: route.modelId }, operatorId, requestId);
    await this.emitPrivilegedAudit("update", "provider_route", route.id, operatorId, { modelId: route.modelId }, requestId);
  }

  async emitRouteDisabled(routeId: string, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.route.disabled", { routeId }, operatorId, requestId);
    await this.emitPrivilegedAudit("disable", "provider_route", routeId, operatorId, {}, requestId);
  }

  async emitAliasCreated(alias: ModelAliasEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.alias.created", { aliasId: alias.id, alias: alias.alias }, operatorId, requestId);
    await this.emitPrivilegedAudit("create", "model_alias", alias.id, operatorId, { alias: alias.alias }, requestId);
  }

  async emitAliasUpdated(alias: ModelAliasEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.alias.updated", { aliasId: alias.id, alias: alias.alias }, operatorId, requestId);
    await this.emitPrivilegedAudit("update", "model_alias", alias.id, operatorId, { alias: alias.alias }, requestId);
  }

  async emitAliasRetired(aliasId: string, aliasName: string, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.alias.retired", { aliasId, alias: aliasName }, operatorId, requestId);
    await this.emitPrivilegedAudit("retire", "model_alias", aliasId, operatorId, { alias: aliasName }, requestId);
  }

  async emitPricingCreated(pricing: ModelPricingEntity, operatorId: string, requestId?: string): Promise<void> {
    await this.emitOutbox("model.pricing.created", { pricingId: pricing.id }, operatorId, requestId);
    await this.emitPrivilegedAudit("create", "model_pricing", pricing.id, operatorId, { pricingId: pricing.id }, requestId);
  }

  async emitSecurityEvent(
    type: string,
    severity: "low" | "medium" | "high" | "critical",
    metadata: Record<string, unknown>,
    requestId: string
  ): Promise<void> {
    const secId = `sec_${createPublicId("model").slice(4)}`;
    await (this.db as any).insert((this.db as any).schema.securityEvents).values({
      id: secId,
      type,
      severity,
      requestId,
      metadata,
      createdAt: new Date(),
    });
  }
}

export class InMemoryModelRegistryEvents implements IModelRegistryEvents {
  public readonly outbox: Array<{ topic: string; payload: Record<string, unknown>; operatorId: string }> = [];
  public readonly audit: Array<{ action: string; resourceType: string; resourceId: string; operatorId: string }> = [];
  public readonly security: Array<{ type: string; severity: string; metadata: Record<string, unknown> }> = [];

  async emitModelCreated(model: CanonicalModelEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.created", payload: { modelId: model.id, canonicalId: model.canonicalId }, operatorId });
    this.audit.push({ action: "create", resourceType: "canonical_model", resourceId: model.id, operatorId });
  }

  async emitModelUpdated(model: CanonicalModelEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.updated", payload: { modelId: model.id, canonicalId: model.canonicalId }, operatorId });
    this.audit.push({ action: "update", resourceType: "canonical_model", resourceId: model.id, operatorId });
  }

  async emitModelDisabled(modelId: string, canonicalId: string, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.disabled", payload: { modelId, canonicalId }, operatorId });
    this.audit.push({ action: "disable", resourceType: "canonical_model", resourceId: modelId, operatorId });
  }

  async emitModelDeprecated(model: CanonicalModelEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.deprecated", payload: { modelId: model.id, canonicalId: model.canonicalId }, operatorId });
    this.audit.push({ action: "deprecate", resourceType: "canonical_model", resourceId: model.id, operatorId });
  }

  async emitModelRetired(modelId: string, canonicalId: string, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.retired", payload: { modelId, canonicalId }, operatorId });
    this.audit.push({ action: "retire", resourceType: "canonical_model", resourceId: modelId, operatorId });
  }

  async emitRouteCreated(route: ProviderRouteEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.route.created", payload: { routeId: route.id }, operatorId });
    this.audit.push({ action: "create", resourceType: "provider_route", resourceId: route.id, operatorId });
  }

  async emitRouteUpdated(route: ProviderRouteEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.route.updated", payload: { routeId: route.id }, operatorId });
    this.audit.push({ action: "update", resourceType: "provider_route", resourceId: route.id, operatorId });
  }

  async emitRouteDisabled(routeId: string, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.route.disabled", payload: { routeId }, operatorId });
    this.audit.push({ action: "disable", resourceType: "provider_route", resourceId: routeId, operatorId });
  }

  async emitAliasCreated(alias: ModelAliasEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.alias.created", payload: { aliasId: alias.id, alias: alias.alias }, operatorId });
    this.audit.push({ action: "create", resourceType: "model_alias", resourceId: alias.id, operatorId });
  }

  async emitAliasUpdated(alias: ModelAliasEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.alias.updated", payload: { aliasId: alias.id, alias: alias.alias }, operatorId });
    this.audit.push({ action: "update", resourceType: "model_alias", resourceId: alias.id, operatorId });
  }

  async emitAliasRetired(aliasId: string, aliasName: string, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.alias.retired", payload: { aliasId, alias: aliasName }, operatorId });
    this.audit.push({ action: "retire", resourceType: "model_alias", resourceId: aliasId, operatorId });
  }

  async emitPricingCreated(pricing: ModelPricingEntity, operatorId: string): Promise<void> {
    this.outbox.push({ topic: "model.pricing.created", payload: { pricingId: pricing.id }, operatorId });
    this.audit.push({ action: "create", resourceType: "model_pricing", resourceId: pricing.id, operatorId });
  }

  async emitSecurityEvent(
    type: string,
    severity: "low" | "medium" | "high" | "critical",
    metadata: Record<string, unknown>
  ): Promise<void> {
    this.security.push({ type, severity, metadata });
  }
}
