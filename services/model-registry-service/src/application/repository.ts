import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "../domain/types.js";

export interface ModelListFilter {
  family?: string | undefined;
  category?: string | undefined;
  capability?: string | undefined;
  status?: string[] | undefined;
  customerVisible?: boolean | undefined;
  routingEligible?: boolean | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface IModelRegistryRepository {
  // Canonical Models
  createModel(model: CanonicalModelEntity): Promise<CanonicalModelEntity>;
  getModelById(id: string): Promise<CanonicalModelEntity | null>;
  getModelByCanonicalId(
    canonicalId: string,
  ): Promise<CanonicalModelEntity | null>;
  updateModel(
    id: string,
    updates: Partial<CanonicalModelEntity>,
  ): Promise<CanonicalModelEntity>;
  listModels(
    filter?: ModelListFilter,
  ): Promise<{ items: CanonicalModelEntity[]; hasMore: boolean }>;
  getAllModels(): Promise<CanonicalModelEntity[]>;

  // Provider Routes
  createRoute(route: ProviderRouteEntity): Promise<ProviderRouteEntity>;
  getRouteById(id: string): Promise<ProviderRouteEntity | null>;
  getRouteByProviderModel(
    providerId: string,
    providerModelId: string,
    region: string,
  ): Promise<ProviderRouteEntity | null>;
  listRoutesByModelId(modelId: string): Promise<ProviderRouteEntity[]>;
  listAllRoutes(): Promise<ProviderRouteEntity[]>;
  updateRoute(
    id: string,
    updates: Partial<ProviderRouteEntity>,
  ): Promise<ProviderRouteEntity>;

  // Model Aliases
  createAlias(alias: ModelAliasEntity): Promise<ModelAliasEntity>;
  getAliasById(id: string): Promise<ModelAliasEntity | null>;
  getAliasByName(alias: string): Promise<ModelAliasEntity | null>;
  listAliases(): Promise<ModelAliasEntity[]>;
  updateAlias(
    id: string,
    updates: Partial<ModelAliasEntity>,
  ): Promise<ModelAliasEntity>;

  // Model Pricing Versions
  createPricing(pricing: ModelPricingEntity): Promise<ModelPricingEntity>;
  getEffectivePricing(
    modelIdOrRouteId: string,
    timestamp?: Date,
  ): Promise<ModelPricingEntity | null>;
  listPricing(filter?: {
    modelId?: string | undefined;
    routeId?: string | undefined;
  }): Promise<ModelPricingEntity[]>;
}
