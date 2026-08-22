import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "../domain/types.js";

export interface IModelRegistryEvents {
  emitModelCreated(
    model: CanonicalModelEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitModelUpdated(
    model: CanonicalModelEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitModelDisabled(
    modelId: string,
    canonicalId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitModelDeprecated(
    model: CanonicalModelEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitModelRetired(
    modelId: string,
    canonicalId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitRouteCreated(
    route: ProviderRouteEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitRouteUpdated(
    route: ProviderRouteEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitRouteDisabled(
    routeId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitAliasCreated(
    alias: ModelAliasEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitAliasUpdated(
    alias: ModelAliasEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitAliasRetired(
    aliasId: string,
    aliasName: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitPricingCreated(
    pricing: ModelPricingEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitSecurityEvent(
    type: string,
    severity: "low" | "medium" | "high" | "critical",
    metadata: Record<string, unknown>,
    requestId: string,
  ): Promise<void>;
}
