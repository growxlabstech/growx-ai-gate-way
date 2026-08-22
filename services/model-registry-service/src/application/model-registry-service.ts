import {
  type CreateCanonicalModelRequest,
  type CreateModelAliasRequest,
  type CreateModelPricingRequest,
  type CreateProviderRouteRequest,
  type DeprecateModelRequest,
  GrowXProviderError,
  type ModelCatalogItem,
  type UpdateCanonicalModelRequest,
  type UpdateModelAliasRequest,
  type UpdateProviderRouteRequest,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";
import {
  validateAliasStatusTransition,
  validateModelStatusTransition,
  validateRouteStatusTransition,
} from "../domain/lifecycle.js";
import {
  modelSupports,
  resolveModelContext,
  type ResolveOptions,
} from "../domain/resolver.js";
import {
  toAdminModelRecord,
  toModelCatalogItem,
  type AdminModelDetail,
} from "../domain/serializers.js";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "../domain/types.js";
import type { IModelRegistryEvents } from "./events.js";
import type {
  IModelRegistryRepository,
  ModelListFilter,
} from "./repository.js";

export class ModelRegistryService {
  constructor(
    private readonly repository: IModelRegistryRepository,
    private readonly events: IModelRegistryEvents,
  ) {}

  // -------------------------------------------------------------
  // Customer Catalog Operations
  // -------------------------------------------------------------

  async listCustomerModels(
    filter: Omit<ModelListFilter, "customerVisible"> = {},
  ): Promise<{ items: ModelCatalogItem[]; hasMore: boolean }> {
    const result = await this.repository.listModels({
      ...filter,
      customerVisible: true,
      status: ["active", "deprecated"],
    });

    let items = result.items;

    // Filter by capability if specified
    if (filter.capability) {
      items = items.filter((m) => modelSupports(m, filter.capability as any));
    }

    return {
      items: items.map(toModelCatalogItem),
      hasMore: result.hasMore,
    };
  }

  async getCustomerModel(
    canonicalIdOrAlias: string,
  ): Promise<ModelCatalogItem> {
    const allAliases = await this.repository.listAliases();
    const allModels = await this.repository.getAllModels();
    const allRoutes = await this.repository.listAllRoutes();

    const resolved = resolveModelContext(
      canonicalIdOrAlias,
      allModels,
      allAliases,
      allRoutes,
      { allowDraft: false, allowDisabled: false },
    );

    if (!resolved.model.customerVisible) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model '${canonicalIdOrAlias}' is not accessible in customer catalog`,
        false,
        404,
      );
    }

    return toModelCatalogItem(resolved.model);
  }

  async resolve(
    requestedModelId: string,
    options: ResolveOptions = {},
  ): Promise<ResolvedModelContext> {
    const allAliases = await this.repository.listAliases();
    const allModels = await this.repository.getAllModels();
    const allRoutes = await this.repository.listAllRoutes();

    return resolveModelContext(
      requestedModelId,
      allModels,
      allAliases,
      allRoutes,
      options,
    );
  }

  // -------------------------------------------------------------
  // Privileged / Ops Model Operations
  // -------------------------------------------------------------

  async createModel(
    input: CreateCanonicalModelRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<CanonicalModelEntity> {
    const existing = await this.repository.getModelByCanonicalId(
      input.canonicalId,
    );
    if (existing) {
      throw new GrowXProviderError(
        "model_invalid_request" as any,
        `Canonical model with ID '${input.canonicalId}' already exists`,
        false,
        409,
      );
    }

    const now = new Date();
    const model: CanonicalModelEntity = {
      id: createPublicId("model"),
      canonicalId: input.canonicalId,
      displayName: input.displayName,
      family: input.family,
      category: input.category ?? "chat",
      status: input.status ?? "active",
      customerVisible: input.customerVisible ?? true,
      routingEligible: input.routingEligible ?? true,
      description: input.description ?? "",
      contextWindow: input.contextWindow,
      maxInputTokens: input.maxInputTokens ?? null,
      maxOutputTokens: input.maxOutputTokens,
      supportsStreaming: input.supportsStreaming ?? true,
      supportsTools: input.supportsTools ?? false,
      supportsStructuredOutput: input.supportsStructuredOutput ?? false,
      supportsReasoning: input.supportsReasoning ?? false,
      inputModalities: input.inputModalities ?? ["text"],
      outputModalities: input.outputModalities ?? ["text"],
      capabilities: input.capabilities ?? ["text.generate", "streaming"],
      reasoningMetadata: input.reasoningMetadata ?? null,
      toolMetadata: input.toolMetadata ?? null,
      structuredOutputMetadata: input.structuredOutputMetadata ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createModel(model);
    await this.events.emitModelCreated(created, operatorId, requestId);
    return created;
  }

  async updateModel(
    id: string,
    input: UpdateCanonicalModelRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<CanonicalModelEntity> {
    const current = await this.repository.getModelById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model with ID '${id}' not found`,
        false,
        404,
      );
    }

    const updates: Partial<CanonicalModelEntity> = {};
    if (input.displayName !== undefined)
      updates.displayName = input.displayName;
    if (input.family !== undefined) updates.family = input.family;
    if (input.category !== undefined) updates.category = input.category;
    if (input.customerVisible !== undefined)
      updates.customerVisible = input.customerVisible;
    if (input.routingEligible !== undefined)
      updates.routingEligible = input.routingEligible;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.contextWindow !== undefined)
      updates.contextWindow = input.contextWindow;
    if (input.maxInputTokens !== undefined)
      updates.maxInputTokens = input.maxInputTokens;
    if (input.maxOutputTokens !== undefined)
      updates.maxOutputTokens = input.maxOutputTokens;
    if (input.supportsStreaming !== undefined)
      updates.supportsStreaming = input.supportsStreaming;
    if (input.supportsTools !== undefined)
      updates.supportsTools = input.supportsTools;
    if (input.supportsStructuredOutput !== undefined)
      updates.supportsStructuredOutput = input.supportsStructuredOutput;
    if (input.supportsReasoning !== undefined)
      updates.supportsReasoning = input.supportsReasoning;
    if (input.inputModalities !== undefined)
      updates.inputModalities = input.inputModalities;
    if (input.outputModalities !== undefined)
      updates.outputModalities = input.outputModalities;
    if (input.capabilities !== undefined)
      updates.capabilities = input.capabilities;
    if (input.reasoningMetadata !== undefined)
      updates.reasoningMetadata = input.reasoningMetadata;
    if (input.toolMetadata !== undefined)
      updates.toolMetadata = input.toolMetadata;
    if (input.structuredOutputMetadata !== undefined)
      updates.structuredOutputMetadata = input.structuredOutputMetadata;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    updates.updatedAt = new Date();

    const updated = await this.repository.updateModel(id, updates);
    await this.events.emitModelUpdated(updated, operatorId, requestId);
    return updated;
  }

  async disableModel(
    id: string,
    operatorId: string,
    requestId?: string,
  ): Promise<CanonicalModelEntity> {
    const current = await this.repository.getModelById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model with ID '${id}' not found`,
        false,
        404,
      );
    }

    validateModelStatusTransition(current.status, "disabled");

    const updated = await this.repository.updateModel(id, {
      status: "disabled",
      routingEligible: false,
      updatedAt: new Date(),
    });

    await this.events.emitModelDisabled(
      updated.id,
      updated.canonicalId,
      operatorId,
      requestId,
    );
    return updated;
  }

  async deprecateModel(
    id: string,
    input: DeprecateModelRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<CanonicalModelEntity> {
    const current = await this.repository.getModelById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model with ID '${id}' not found`,
        false,
        404,
      );
    }

    validateModelStatusTransition(current.status, "deprecated");

    const now = new Date();
    const updated = await this.repository.updateModel(id, {
      status: "deprecated",
      deprecatedAt: now,
      sunsetAt: input.sunsetAt ? new Date(input.sunsetAt) : null,
      replacementModelId: input.replacementModelId ?? null,
      deprecationMessage: input.message ?? null,
      updatedAt: now,
    });

    await this.events.emitModelDeprecated(updated, operatorId, requestId);
    return updated;
  }

  async retireModel(
    id: string,
    operatorId: string,
    requestId?: string,
  ): Promise<CanonicalModelEntity> {
    const current = await this.repository.getModelById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model with ID '${id}' not found`,
        false,
        404,
      );
    }

    validateModelStatusTransition(current.status, "retired");

    const updated = await this.repository.updateModel(id, {
      status: "retired",
      routingEligible: false,
      customerVisible: false,
      updatedAt: new Date(),
    });

    await this.events.emitModelRetired(
      updated.id,
      updated.canonicalId,
      operatorId,
      requestId,
    );
    return updated;
  }

  // -------------------------------------------------------------
  // Provider Route Operations
  // -------------------------------------------------------------

  async addProviderRoute(
    input: CreateProviderRouteRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderRouteEntity> {
    const model = await this.repository.getModelById(input.modelId);
    if (!model) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model '${input.modelId}' does not exist for route attachment`,
        false,
        404,
      );
    }

    const region = input.region ?? "global";
    const existing = await this.repository.getRouteByProviderModel(
      input.providerId,
      input.providerModelId,
      region,
    );
    if (existing) {
      throw new GrowXProviderError(
        "model_invalid_request" as any,
        `Provider route for provider '${input.providerId}' model '${input.providerModelId}' region '${region}' already exists`,
        false,
        409,
      );
    }

    const now = new Date();
    const route: ProviderRouteEntity = {
      id: createPublicId("route"),
      modelId: model.id,
      canonicalModelId: model.canonicalId,
      providerId: input.providerId,
      providerModelId: input.providerModelId,
      region,
      status: input.status ?? "active",
      routingEligible: input.routingEligible ?? true,
      priority: input.priority ?? 100,
      contextWindowOverride: input.contextWindowOverride ?? null,
      maxOutputTokensOverride: input.maxOutputTokensOverride ?? null,
      capabilitiesOverrides: input.capabilitiesOverrides ?? null,
      pricingReference: input.pricingReference ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createRoute(route);
    await this.events.emitRouteCreated(created, operatorId, requestId);
    return created;
  }

  async updateProviderRoute(
    routeId: string,
    input: UpdateProviderRouteRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderRouteEntity> {
    const current = await this.repository.getRouteById(routeId);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Provider route '${routeId}' not found`,
        false,
        404,
      );
    }

    if (input.status) {
      validateRouteStatusTransition(current.status, input.status);
    }

    const updates: Partial<ProviderRouteEntity> = {};
    if (input.providerModelId !== undefined)
      updates.providerModelId = input.providerModelId;
    if (input.region !== undefined) updates.region = input.region;
    if (input.status !== undefined) updates.status = input.status;
    if (input.routingEligible !== undefined)
      updates.routingEligible = input.routingEligible;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.contextWindowOverride !== undefined)
      updates.contextWindowOverride = input.contextWindowOverride;
    if (input.maxOutputTokensOverride !== undefined)
      updates.maxOutputTokensOverride = input.maxOutputTokensOverride;
    if (input.capabilitiesOverrides !== undefined)
      updates.capabilitiesOverrides = input.capabilitiesOverrides;
    if (input.pricingReference !== undefined)
      updates.pricingReference = input.pricingReference;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    updates.updatedAt = new Date();

    const updated = await this.repository.updateRoute(routeId, updates);
    await this.events.emitRouteUpdated(updated, operatorId, requestId);
    return updated;
  }

  async disableProviderRoute(
    routeId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderRouteEntity> {
    const current = await this.repository.getRouteById(routeId);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Provider route '${routeId}' not found`,
        false,
        404,
      );
    }

    validateRouteStatusTransition(current.status, "disabled");

    const updated = await this.repository.updateRoute(routeId, {
      status: "disabled",
      routingEligible: false,
      updatedAt: new Date(),
    });

    await this.events.emitRouteDisabled(updated.id, operatorId, requestId);
    return updated;
  }

  // -------------------------------------------------------------
  // Model Alias Operations
  // -------------------------------------------------------------

  async createAlias(
    input: CreateModelAliasRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ModelAliasEntity> {
    const targetModel = await this.repository.getModelByCanonicalId(
      input.canonicalModelId,
    );
    if (!targetModel) {
      throw new GrowXProviderError(
        "model_not_found",
        `Target model '${input.canonicalModelId}' not found for alias creation`,
        false,
        404,
      );
    }

    const existing = await this.repository.getAliasByName(input.alias);
    if (existing) {
      throw new GrowXProviderError(
        "model_invalid_request" as any,
        `Alias '${input.alias}' already exists`,
        false,
        409,
      );
    }

    // Direct loop prevention
    if (input.alias.toLowerCase() === input.canonicalModelId.toLowerCase()) {
      throw new GrowXProviderError(
        "model_invalid_request" as any,
        `Alias cannot point directly to itself: '${input.alias}'`,
        false,
        400,
      );
    }

    const now = new Date();
    const alias: ModelAliasEntity = {
      id: `alias_${createPublicId("model").slice(6)}`,
      alias: input.alias,
      canonicalModelId: targetModel.canonicalId,
      status: "active",
      type: input.type ?? "static",
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createAlias(alias);
    await this.events.emitAliasCreated(created, operatorId, requestId);
    return created;
  }

  async updateAlias(
    id: string,
    input: UpdateModelAliasRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ModelAliasEntity> {
    const current = await this.repository.getAliasById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Alias '${id}' not found`,
        false,
        404,
      );
    }

    if (input.status) {
      validateAliasStatusTransition(current.status, input.status);
    }

    if (input.canonicalModelId) {
      const target = await this.repository.getModelByCanonicalId(
        input.canonicalModelId,
      );
      if (!target) {
        throw new GrowXProviderError(
          "model_not_found",
          `Target model '${input.canonicalModelId}' does not exist`,
          false,
          404,
        );
      }
    }

    const updates: Partial<ModelAliasEntity> = {};
    if (input.canonicalModelId !== undefined)
      updates.canonicalModelId = input.canonicalModelId;
    if (input.status !== undefined) updates.status = input.status;
    if (input.type !== undefined) updates.type = input.type;
    if (input.description !== undefined)
      updates.description = input.description;
    updates.updatedAt = new Date();

    const updated = await this.repository.updateAlias(id, updates);
    await this.events.emitAliasUpdated(updated, operatorId, requestId);
    return updated;
  }

  async retireAlias(
    id: string,
    operatorId: string,
    requestId?: string,
  ): Promise<ModelAliasEntity> {
    const current = await this.repository.getAliasById(id);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Alias '${id}' not found`,
        false,
        404,
      );
    }

    validateAliasStatusTransition(current.status, "retired");

    const now = new Date();
    const updated = await this.repository.updateAlias(id, {
      status: "retired",
      retiredAt: now,
      updatedAt: now,
    });

    await this.events.emitAliasRetired(
      updated.id,
      updated.alias,
      operatorId,
      requestId,
    );
    return updated;
  }

  // -------------------------------------------------------------
  // Model Pricing Operations
  // -------------------------------------------------------------

  async addPricing(
    input: CreateModelPricingRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ModelPricingEntity> {
    if (!input.modelId && !input.routeId) {
      throw new GrowXProviderError(
        "model_invalid_request" as any,
        "Pricing record must attach to either a modelId or routeId",
        false,
        400,
      );
    }

    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : new Date();
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;

    const pricing: ModelPricingEntity = {
      id: `price_${createPublicId("model").slice(6)}`,
      modelId: input.modelId ?? null,
      routeId: input.routeId ?? null,
      pricingType: input.pricingType ?? "standard",
      inputPricePerMillionMinor: input.inputPricePerMillionMinor,
      outputPricePerMillionMinor: input.outputPricePerMillionMinor,
      cachedInputPricePerMillionMinor:
        input.cachedInputPricePerMillionMinor ?? null,
      reasoningPricePerMillionMinor:
        input.reasoningPricePerMillionMinor ?? null,
      currency: input.currency ?? "USD",
      effectiveFrom,
      effectiveTo,
      source: input.source ?? "manual",
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };

    const created = await this.repository.createPricing(pricing);
    await this.events.emitPricingCreated(created, operatorId, requestId);
    return created;
  }

  async getEffectivePricing(
    modelIdOrRouteId: string,
    timestamp = new Date(),
  ): Promise<ModelPricingEntity | null> {
    return this.repository.getEffectivePricing(modelIdOrRouteId, timestamp);
  }

  // -------------------------------------------------------------
  // Privileged Inspection & Detail Queries
  // -------------------------------------------------------------

  async getAdminModelDetail(
    idOrCanonicalId: string,
  ): Promise<AdminModelDetail> {
    let model = await this.repository.getModelById(idOrCanonicalId);
    if (!model) {
      model = await this.repository.getModelByCanonicalId(idOrCanonicalId);
    }
    if (!model) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model '${idOrCanonicalId}' not found`,
        false,
        404,
      );
    }

    const routes = await this.repository.listRoutesByModelId(model.id);
    const allAliases = await this.repository.listAliases();
    const modelAliases = allAliases.filter(
      (a) =>
        a.canonicalModelId === model!.canonicalId ||
        a.canonicalModelId === model!.id,
    );
    const pricing = await this.repository.listPricing({ modelId: model.id });

    return toAdminModelRecord(model, routes, modelAliases, pricing);
  }

  async listAdminModels(
    filter: ModelListFilter = {},
  ): Promise<{ items: CanonicalModelEntity[]; hasMore: boolean }> {
    return this.repository.listModels(filter);
  }

  async listAllAliases(): Promise<ModelAliasEntity[]> {
    return this.repository.listAliases();
  }

  async listAllRoutes(): Promise<ProviderRouteEntity[]> {
    return this.repository.listAllRoutes();
  }

  async listPricing(filter?: {
    modelId?: string | undefined;
    routeId?: string | undefined;
  }): Promise<ModelPricingEntity[]> {
    return this.repository.listPricing(filter);
  }

  // -------------------------------------------------------------
  // Provider Sync Architecture Hook
  // -------------------------------------------------------------

  proposeSyncUpdates(
    providerId: string,
    remoteModels: Array<{
      providerModelId: string;
      displayName: string;
      contextWindow: number;
      maxOutputTokens: number;
    }>,
    existingRoutes: ProviderRouteEntity[],
  ): Array<{
    action: "create_route" | "noop";
    providerModelId: string;
    reason: string;
  }> {
    const proposals: Array<{
      action: "create_route" | "noop";
      providerModelId: string;
      reason: string;
    }> = [];

    for (const remote of remoteModels) {
      const match = existingRoutes.find(
        (r) =>
          r.providerId === providerId &&
          r.providerModelId === remote.providerModelId,
      );
      if (!match) {
        proposals.push({
          action: "create_route",
          providerModelId: remote.providerModelId,
          reason: `Discovered new provider model '${remote.providerModelId}' from provider '${providerId}'`,
        });
      } else {
        proposals.push({
          action: "noop",
          providerModelId: remote.providerModelId,
          reason: `Provider model '${remote.providerModelId}' is already registered`,
        });
      }
    }

    return proposals;
  }
}
