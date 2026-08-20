import {
  type schema,
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "../domain/types.js";
import type { IModelRegistryRepository, ModelListFilter } from "../application/repository.js";
import type { CanonicalCapability, InputModality, ModelCategory, OutputModality } from "@growx/contracts";

export class DrizzleModelRegistryRepository implements IModelRegistryRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  // -------------------------------------------------------------
  // Canonical Models
  // -------------------------------------------------------------

  async createModel(model: CanonicalModelEntity): Promise<CanonicalModelEntity> {
    return this.db.transaction(async (tx) => {
      await tx.insert((tx as any).schema.canonicalModels).values({
        id: model.id,
        canonicalId: model.canonicalId,
        displayName: model.displayName,
        family: model.family,
        category: model.category,
        status: model.status,
        customerVisible: model.customerVisible,
        routingEligible: model.routingEligible,
        description: model.description,
        contextWindow: model.contextWindow,
        maxInputTokens: model.maxInputTokens ?? null,
        maxOutputTokens: model.maxOutputTokens,
        supportsStreaming: model.supportsStreaming,
        supportsTools: model.supportsTools,
        supportsStructuredOutput: model.supportsStructuredOutput,
        supportsReasoning: model.supportsReasoning,
        inputModalities: model.inputModalities as any,
        outputModalities: model.outputModalities as any,
        reasoningMetadata: model.reasoningMetadata ?? null,
        toolMetadata: model.toolMetadata ?? null,
        structuredOutputMetadata: model.structuredOutputMetadata ?? null,
        deprecatedAt: model.deprecatedAt ?? null,
        sunsetAt: model.sunsetAt ?? null,
        replacementModelId: model.replacementModelId ?? null,
        deprecationMessage: model.deprecationMessage ?? null,
        metadata: model.metadata,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      });

      if (model.capabilities && model.capabilities.length > 0) {
        await tx.insert((tx as any).schema.canonicalModelCapabilities).values(
          model.capabilities.map((cap) => ({
            modelId: model.id,
            capability: cap,
            createdAt: new Date(),
          }))
        );
      }

      return model;
    });
  }

  async getModelById(id: string): Promise<CanonicalModelEntity | null> {
    const row = await this.db.query.canonicalModels.findFirst({
      where: (table, { eq }) => eq(table.id, id),
    });
    if (!row) return null;

    const capabilitiesRows = await this.db.query.canonicalModelCapabilities.findMany({
      where: (table, { eq }) => eq(table.modelId, id),
    });

    return this.mapModelRow(row, capabilitiesRows.map((c) => c.capability as CanonicalCapability));
  }

  async getModelByCanonicalId(canonicalId: string): Promise<CanonicalModelEntity | null> {
    const row = await this.db.query.canonicalModels.findFirst({
      where: (table, { eq }) => eq(table.canonicalId, canonicalId),
    });
    if (!row) return null;

    const capabilitiesRows = await this.db.query.canonicalModelCapabilities.findMany({
      where: (table, { eq }) => eq(table.modelId, row.id),
    });

    return this.mapModelRow(row, capabilitiesRows.map((c) => c.capability as CanonicalCapability));
  }

  async updateModel(id: string, updates: Partial<CanonicalModelEntity>): Promise<CanonicalModelEntity> {
    return this.db.transaction(async (tx) => {
      const updatePayload: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (updates.displayName !== undefined) updatePayload.displayName = updates.displayName;
      if (updates.family !== undefined) updatePayload.family = updates.family;
      if (updates.category !== undefined) updatePayload.category = updates.category;
      if (updates.status !== undefined) updatePayload.status = updates.status;
      if (updates.customerVisible !== undefined) updatePayload.customerVisible = updates.customerVisible;
      if (updates.routingEligible !== undefined) updatePayload.routingEligible = updates.routingEligible;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.contextWindow !== undefined) updatePayload.contextWindow = updates.contextWindow;
      if (updates.maxInputTokens !== undefined) updatePayload.maxInputTokens = updates.maxInputTokens;
      if (updates.maxOutputTokens !== undefined) updatePayload.maxOutputTokens = updates.maxOutputTokens;
      if (updates.supportsStreaming !== undefined) updatePayload.supportsStreaming = updates.supportsStreaming;
      if (updates.supportsTools !== undefined) updatePayload.supportsTools = updates.supportsTools;
      if (updates.supportsStructuredOutput !== undefined) updatePayload.supportsStructuredOutput = updates.supportsStructuredOutput;
      if (updates.supportsReasoning !== undefined) updatePayload.supportsReasoning = updates.supportsReasoning;
      if (updates.inputModalities !== undefined) updatePayload.inputModalities = updates.inputModalities;
      if (updates.outputModalities !== undefined) updatePayload.outputModalities = updates.outputModalities;
      if (updates.reasoningMetadata !== undefined) updatePayload.reasoningMetadata = updates.reasoningMetadata;
      if (updates.toolMetadata !== undefined) updatePayload.toolMetadata = updates.toolMetadata;
      if (updates.structuredOutputMetadata !== undefined) updatePayload.structuredOutputMetadata = updates.structuredOutputMetadata;
      if (updates.deprecatedAt !== undefined) updatePayload.deprecatedAt = updates.deprecatedAt;
      if (updates.sunsetAt !== undefined) updatePayload.sunsetAt = updates.sunsetAt;
      if (updates.replacementModelId !== undefined) updatePayload.replacementModelId = updates.replacementModelId;
      if (updates.deprecationMessage !== undefined) updatePayload.deprecationMessage = updates.deprecationMessage;
      if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;

      await tx
        .update((tx as any).schema.canonicalModels)
        .set(updatePayload)
        .where(eq((tx as any).schema.canonicalModels.id, id));

      if (updates.capabilities !== undefined) {
        await tx
          .delete((tx as any).schema.canonicalModelCapabilities)
          .where(eq((tx as any).schema.canonicalModelCapabilities.modelId, id));

        if (updates.capabilities.length > 0) {
          await tx.insert((tx as any).schema.canonicalModelCapabilities).values(
            updates.capabilities.map((cap) => ({
              modelId: id,
              capability: cap,
              createdAt: new Date(),
            }))
          );
        }
      }

      const updated = await this.getModelById(id);
      if (!updated) throw new Error(`Model '${id}' not found after update`);
      return updated;
    });
  }

  async listModels(filter: ModelListFilter = {}): Promise<{ items: CanonicalModelEntity[]; hasMore: boolean }> {
    const conditions: any[] = [];

    if (filter.customerVisible !== undefined) {
      conditions.push(eq((this.db as any).schema.canonicalModels.customerVisible, filter.customerVisible));
    }
    if (filter.routingEligible !== undefined) {
      conditions.push(eq((this.db as any).schema.canonicalModels.routingEligible, filter.routingEligible));
    }
    if (filter.status && filter.status.length > 0) {
      conditions.push(inArray((this.db as any).schema.canonicalModels.status, filter.status));
    }
    if (filter.family) {
      conditions.push(eq((this.db as any).schema.canonicalModels.family, filter.family));
    }
    if (filter.category) {
      conditions.push(eq((this.db as any).schema.canonicalModels.category, filter.category));
    }
    if (filter.search) {
      const q = `%${filter.search}%`;
      conditions.push(
        or(
          ilike((this.db as any).schema.canonicalModels.canonicalId, q),
          ilike((this.db as any).schema.canonicalModels.displayName, q),
          ilike((this.db as any).schema.canonicalModels.family, q)
        )
      );
    }

    const limit = filter.limit ?? 50;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db.query.canonicalModels.findMany({
      where: whereClause,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const resultRows = rows.slice(0, limit);

    // Fetch capabilities for all returned models in one query
    const modelIds = resultRows.map((r) => r.id);
    const capabilitiesMap = new Map<string, CanonicalCapability[]>();

    if (modelIds.length > 0) {
      const capRows = await this.db.query.canonicalModelCapabilities.findMany({
        where: (table, { inArray }) => inArray(table.modelId, modelIds),
      });
      for (const cap of capRows) {
        const existing = capabilitiesMap.get(cap.modelId) ?? [];
        existing.push(cap.capability as CanonicalCapability);
        capabilitiesMap.set(cap.modelId, existing);
      }
    }

    const items = resultRows.map((r) =>
      this.mapModelRow(r, capabilitiesMap.get(r.id) ?? [])
    );

    return { items, hasMore };
  }

  async getAllModels(): Promise<CanonicalModelEntity[]> {
    const rows = await this.db.query.canonicalModels.findMany();
    const modelIds = rows.map((r) => r.id);
    const capabilitiesMap = new Map<string, CanonicalCapability[]>();

    if (modelIds.length > 0) {
      const capRows = await this.db.query.canonicalModelCapabilities.findMany({
        where: (table, { inArray }) => inArray(table.modelId, modelIds),
      });
      for (const cap of capRows) {
        const existing = capabilitiesMap.get(cap.modelId) ?? [];
        existing.push(cap.capability as CanonicalCapability);
        capabilitiesMap.set(cap.modelId, existing);
      }
    }

    return rows.map((r) => this.mapModelRow(r, capabilitiesMap.get(r.id) ?? []));
  }

  // -------------------------------------------------------------
  // Provider Routes
  // -------------------------------------------------------------

  async createRoute(route: ProviderRouteEntity): Promise<ProviderRouteEntity> {
    await this.db.insert((this.db as any).schema.modelProviderRoutes).values({
      id: route.id,
      modelId: route.modelId,
      providerId: route.providerId,
      providerModelId: route.providerModelId,
      region: route.region,
      status: route.status,
      routingEligible: route.routingEligible,
      priority: route.priority,
      contextWindowOverride: route.contextWindowOverride ?? null,
      maxOutputTokensOverride: route.maxOutputTokensOverride ?? null,
      capabilitiesOverrides: route.capabilitiesOverrides as any,
      pricingReference: route.pricingReference ?? null,
      availableFrom: route.availableFrom ?? null,
      deprecatedAt: route.deprecatedAt ?? null,
      retiredAt: route.retiredAt ?? null,
      metadata: route.metadata,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    });

    return route;
  }

  async getRouteById(id: string): Promise<ProviderRouteEntity | null> {
    const row = await this.db.query.modelProviderRoutes.findFirst({
      where: (table, { eq }) => eq(table.id, id),
    });
    return row ? this.mapRouteRow(row) : null;
  }

  async getRouteByProviderModel(
    providerId: string,
    providerModelId: string,
    region: string
  ): Promise<ProviderRouteEntity | null> {
    const row = await this.db.query.modelProviderRoutes.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.providerId, providerId),
          eq(table.providerModelId, providerModelId),
          eq(table.region, region)
        ),
    });
    return row ? this.mapRouteRow(row) : null;
  }

  async listRoutesByModelId(modelId: string): Promise<ProviderRouteEntity[]> {
    const rows = await this.db.query.modelProviderRoutes.findMany({
      where: (table, { eq }) => eq(table.modelId, modelId),
    });
    return rows.map((r) => this.mapRouteRow(r));
  }

  async listAllRoutes(): Promise<ProviderRouteEntity[]> {
    const rows = await this.db.query.modelProviderRoutes.findMany();
    return rows.map((r) => this.mapRouteRow(r));
  }

  async updateRoute(id: string, updates: Partial<ProviderRouteEntity>): Promise<ProviderRouteEntity> {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.providerModelId !== undefined) updatePayload.providerModelId = updates.providerModelId;
    if (updates.region !== undefined) updatePayload.region = updates.region;
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.routingEligible !== undefined) updatePayload.routingEligible = updates.routingEligible;
    if (updates.priority !== undefined) updatePayload.priority = updates.priority;
    if (updates.contextWindowOverride !== undefined) updatePayload.contextWindowOverride = updates.contextWindowOverride;
    if (updates.maxOutputTokensOverride !== undefined) updatePayload.maxOutputTokensOverride = updates.maxOutputTokensOverride;
    if (updates.capabilitiesOverrides !== undefined) updatePayload.capabilitiesOverrides = updates.capabilitiesOverrides;
    if (updates.pricingReference !== undefined) updatePayload.pricingReference = updates.pricingReference;
    if (updates.deprecatedAt !== undefined) updatePayload.deprecatedAt = updates.deprecatedAt;
    if (updates.retiredAt !== undefined) updatePayload.retiredAt = updates.retiredAt;
    if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;

    await this.db
      .update((this.db as any).schema.modelProviderRoutes)
      .set(updatePayload)
      .where(eq((this.db as any).schema.modelProviderRoutes.id, id));

    const updated = await this.getRouteById(id);
    if (!updated) throw new Error(`Route '${id}' not found after update`);
    return updated;
  }

  // -------------------------------------------------------------
  // Aliases
  // -------------------------------------------------------------

  async createAlias(alias: ModelAliasEntity): Promise<ModelAliasEntity> {
    await this.db.insert((this.db as any).schema.canonicalModelAliases).values({
      id: alias.id,
      alias: alias.alias,
      canonicalModelId: alias.canonicalModelId,
      status: alias.status,
      type: alias.type,
      description: alias.description ?? null,
      retiredAt: alias.retiredAt ?? null,
      createdAt: alias.createdAt,
      updatedAt: alias.updatedAt,
    });
    return alias;
  }

  async getAliasById(id: string): Promise<ModelAliasEntity | null> {
    const row = await this.db.query.canonicalModelAliases.findFirst({
      where: (table, { eq }) => eq(table.id, id),
    });
    return row ? this.mapAliasRow(row) : null;
  }

  async getAliasByName(alias: string): Promise<ModelAliasEntity | null> {
    const row = await this.db.query.canonicalModelAliases.findFirst({
      where: (table, { eq }) => eq(table.alias, alias),
    });
    return row ? this.mapAliasRow(row) : null;
  }

  async listAliases(): Promise<ModelAliasEntity[]> {
    const rows = await this.db.query.canonicalModelAliases.findMany();
    return rows.map((r) => this.mapAliasRow(r));
  }

  async updateAlias(id: string, updates: Partial<ModelAliasEntity>): Promise<ModelAliasEntity> {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.canonicalModelId !== undefined) updatePayload.canonicalModelId = updates.canonicalModelId;
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.type !== undefined) updatePayload.type = updates.type;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.retiredAt !== undefined) updatePayload.retiredAt = updates.retiredAt;

    await this.db
      .update((this.db as any).schema.canonicalModelAliases)
      .set(updatePayload)
      .where(eq((this.db as any).schema.canonicalModelAliases.id, id));

    const updated = await this.getAliasById(id);
    if (!updated) throw new Error(`Alias '${id}' not found after update`);
    return updated;
  }

  // -------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------

  async createPricing(pricing: ModelPricingEntity): Promise<ModelPricingEntity> {
    await this.db.insert((this.db as any).schema.canonicalModelPricing).values({
      id: pricing.id,
      modelId: pricing.modelId ?? null,
      routeId: pricing.routeId ?? null,
      pricingType: pricing.pricingType,
      inputPricePerMillionMinor: BigInt(pricing.inputPricePerMillionMinor),
      outputPricePerMillionMinor: BigInt(pricing.outputPricePerMillionMinor),
      cachedInputPricePerMillionMinor: pricing.cachedInputPricePerMillionMinor !== undefined && pricing.cachedInputPricePerMillionMinor !== null
        ? BigInt(pricing.cachedInputPricePerMillionMinor)
        : null,
      reasoningPricePerMillionMinor: pricing.reasoningPricePerMillionMinor !== undefined && pricing.reasoningPricePerMillionMinor !== null
        ? BigInt(pricing.reasoningPricePerMillionMinor)
        : null,
      currency: pricing.currency,
      effectiveFrom: pricing.effectiveFrom,
      effectiveTo: pricing.effectiveTo ?? null,
      source: pricing.source,
      metadata: pricing.metadata,
      createdAt: pricing.createdAt,
    });
    return pricing;
  }

  async getEffectivePricing(
    modelIdOrRouteId: string,
    timestamp = new Date()
  ): Promise<ModelPricingEntity | null> {
    const rows = await this.db.query.canonicalModelPricing.findMany({
      where: (table, { or, eq, and, lte, gte, isNull }) =>
        and(
          or(eq(table.modelId, modelIdOrRouteId), eq(table.routeId, modelIdOrRouteId)),
          lte(table.effectiveFrom, timestamp),
          or(isNull(table.effectiveTo), gte(table.effectiveTo, timestamp))
        ),
      orderBy: (table, { desc }) => [desc(table.effectiveFrom)],
      limit: 1,
    });

    const row = rows[0];
    return row ? this.mapPricingRow(row) : null;
  }

  async listPricing(filter?: { modelId?: string; routeId?: string }): Promise<ModelPricingEntity[]> {
    const conditions: any[] = [];
    if (filter?.modelId) {
      conditions.push(eq((this.db as any).schema.canonicalModelPricing.modelId, filter.modelId));
    }
    if (filter?.routeId) {
      conditions.push(eq((this.db as any).schema.canonicalModelPricing.routeId, filter.routeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db.query.canonicalModelPricing.findMany({
      where: whereClause,
      orderBy: (table, { desc }) => [desc(table.effectiveFrom)],
    });

    return rows.map((r) => this.mapPricingRow(r));
  }

  // -------------------------------------------------------------
  // Row Mappers
  // -------------------------------------------------------------

  private mapModelRow(row: any, capabilities: CanonicalCapability[]): CanonicalModelEntity {
    return {
      id: row.id,
      canonicalId: row.canonicalId,
      displayName: row.displayName,
      family: row.family,
      category: row.category as ModelCategory,
      status: row.status,
      customerVisible: row.customerVisible,
      routingEligible: row.routingEligible,
      description: row.description,
      contextWindow: row.contextWindow,
      maxInputTokens: row.maxInputTokens ?? null,
      maxOutputTokens: row.maxOutputTokens,
      supportsStreaming: row.supportsStreaming,
      supportsTools: row.supportsTools,
      supportsStructuredOutput: row.supportsStructuredOutput,
      supportsReasoning: row.supportsReasoning,
      inputModalities: (row.inputModalities as InputModality[]) ?? ["text"],
      outputModalities: (row.outputModalities as OutputModality[]) ?? ["text"],
      capabilities,
      reasoningMetadata: row.reasoningMetadata ?? null,
      toolMetadata: row.toolMetadata ?? null,
      structuredOutputMetadata: row.structuredOutputMetadata ?? null,
      deprecatedAt: row.deprecatedAt ?? null,
      sunsetAt: row.sunsetAt ?? null,
      replacementModelId: row.replacementModelId ?? null,
      deprecationMessage: row.deprecationMessage ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapRouteRow(row: any): ProviderRouteEntity {
    return {
      id: row.id,
      modelId: row.modelId,
      canonicalModelId: row.modelId, // will be resolved or set
      providerId: row.providerId,
      providerModelId: row.providerModelId,
      region: row.region,
      status: row.status,
      routingEligible: row.routingEligible,
      priority: row.priority,
      contextWindowOverride: row.contextWindowOverride ?? null,
      maxOutputTokensOverride: row.maxOutputTokensOverride ?? null,
      capabilitiesOverrides: (row.capabilitiesOverrides as CanonicalCapability[]) ?? null,
      pricingReference: row.pricingReference ?? null,
      availableFrom: row.availableFrom ?? null,
      deprecatedAt: row.deprecatedAt ?? null,
      retiredAt: row.retiredAt ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapAliasRow(row: any): ModelAliasEntity {
    return {
      id: row.id,
      alias: row.alias,
      canonicalModelId: row.canonicalModelId,
      status: row.status,
      type: row.type,
      description: row.description ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      retiredAt: row.retiredAt ?? null,
    };
  }

  private mapPricingRow(row: any): ModelPricingEntity {
    return {
      id: row.id,
      modelId: row.modelId ?? null,
      routeId: row.routeId ?? null,
      pricingType: row.pricingType,
      inputPricePerMillionMinor: Number(row.inputPricePerMillionMinor),
      outputPricePerMillionMinor: Number(row.outputPricePerMillionMinor),
      cachedInputPricePerMillionMinor: row.cachedInputPricePerMillionMinor !== null ? Number(row.cachedInputPricePerMillionMinor) : null,
      reasoningPricePerMillionMinor: row.reasoningPricePerMillionMinor !== null ? Number(row.reasoningPricePerMillionMinor) : null,
      currency: row.currency,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? null,
      source: row.source,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    };
  }
}
