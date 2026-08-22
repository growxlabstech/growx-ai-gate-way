import type {
  ModelCatalogItem,
  OpenAIModelItem,
  OpenAIModelListResponse,
} from "@growx/contracts";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "./types.js";

export function toModelCatalogItem(
  model: CanonicalModelEntity,
): ModelCatalogItem {
  return {
    id: model.canonicalId,
    canonicalId: model.canonicalId,
    displayName: model.displayName,
    family: model.family,
    category: model.category,
    status: model.status,
    description: model.description,
    contextWindow: model.contextWindow,
    maxInputTokens: model.maxInputTokens ?? null,
    maxOutputTokens: model.maxOutputTokens,
    supportsStreaming: model.supportsStreaming,
    supportsTools: model.supportsTools,
    supportsStructuredOutput: model.supportsStructuredOutput,
    supportsReasoning: model.supportsReasoning,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    capabilities: model.capabilities,
    deprecatedAt: model.deprecatedAt ? model.deprecatedAt.toISOString() : null,
    sunsetAt: model.sunsetAt ? model.sunsetAt.toISOString() : null,
    replacementModelId: model.replacementModelId ?? null,
    deprecationMessage: model.deprecationMessage ?? null,
  };
}

export function toOpenAIModelItem(
  model: CanonicalModelEntity,
): OpenAIModelItem {
  return {
    id: model.canonicalId,
    object: "model",
    created: Math.floor(model.createdAt.getTime() / 1000),
    owned_by: model.family,
  };
}

export function toOpenAIModelList(
  models: readonly CanonicalModelEntity[],
): OpenAIModelListResponse {
  return {
    object: "list",
    data: models.map(toOpenAIModelItem),
  };
}

export interface AdminModelDetail {
  model: CanonicalModelEntity;
  routes: ProviderRouteEntity[];
  aliases: ModelAliasEntity[];
  pricing: ModelPricingEntity[];
}

export function toAdminModelRecord(
  model: CanonicalModelEntity,
  routes: ProviderRouteEntity[] = [],
  aliases: ModelAliasEntity[] = [],
  pricing: ModelPricingEntity[] = [],
): AdminModelDetail {
  return {
    model,
    routes,
    aliases,
    pricing,
  };
}
