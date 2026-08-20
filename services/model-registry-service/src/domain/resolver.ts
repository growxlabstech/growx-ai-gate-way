import {
  type CanonicalCapability,
  GrowXProviderError,
} from "@growx/contracts";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "./types.js";

export interface ResolveOptions {
  maxHops?: number | undefined;
  allowDraft?: boolean | undefined;
  allowDisabled?: boolean | undefined;
}

export function eligibleConfiguredRoutes(
  model: CanonicalModelEntity,
  routes: readonly ProviderRouteEntity[]
): ProviderRouteEntity[] {
  if (!model.routingEligible) return [];
  if (!["active", "deprecated"].includes(model.status)) return [];

  return routes.filter((route) => {
    if (route.modelId !== model.id && route.canonicalModelId !== model.canonicalId) {
      return false;
    }
    if (!route.routingEligible) return false;
    return route.status === "active" || route.status === "degraded";
  });
}

export function isModelExecutable(
  model: CanonicalModelEntity,
  routes: readonly ProviderRouteEntity[]
): boolean {
  if (!model.routingEligible) return false;
  if (!["active", "deprecated"].includes(model.status)) return false;
  const eligible = eligibleConfiguredRoutes(model, routes);
  return eligible.length > 0;
}

export function modelSupports(
  model: CanonicalModelEntity,
  capability: CanonicalCapability
): boolean {
  if (model.capabilities.includes(capability)) return true;

  // Semantic capability mappings
  switch (capability) {
    case "streaming":
      return model.supportsStreaming;
    case "tools.call":
      return model.supportsTools;
    case "structured_output":
      return model.supportsStructuredOutput;
    case "text.reason":
      return model.supportsReasoning;
    case "vision.input":
      return model.inputModalities.includes("image");
    case "audio.input":
      return model.inputModalities.includes("audio");
    case "audio.output":
      return model.outputModalities.includes("audio");
    case "embeddings.create":
      return model.category === "embeddings" || model.outputModalities.includes("embeddings");
    default:
      return false;
  }
}

export function routeSupports(
  route: ProviderRouteEntity,
  model: CanonicalModelEntity,
  capability: CanonicalCapability
): boolean {
  if (route.capabilitiesOverrides && Array.isArray(route.capabilitiesOverrides)) {
    return route.capabilitiesOverrides.includes(capability);
  }
  return modelSupports(model, capability);
}

export function resolveAliasChain(
  requestedId: string,
  aliases: readonly ModelAliasEntity[],
  maxHops = 5
): { canonicalModelId: string; aliasUsed?: { alias: string; type: ModelAliasEntity["type"] } | undefined } {
  let current = requestedId;
  const visited = new Set<string>([current]);
  let aliasUsed: { alias: string; type: ModelAliasEntity["type"] } | undefined;

  for (let hop = 0; hop < maxHops; hop++) {
    const matchingAlias = aliases.find(
      (a) => a.alias.toLowerCase() === current.toLowerCase() && a.status === "active"
    );

    if (!matchingAlias) {
      break;
    }

    if (!aliasUsed) {
      aliasUsed = {
        alias: matchingAlias.alias,
        type: matchingAlias.type,
      };
    }

    const nextTarget = matchingAlias.canonicalModelId;
    if (visited.has(nextTarget.toLowerCase())) {
      throw new GrowXProviderError(
        "model_not_found",
        `Alias cycle detected for '${requestedId}' (cycle at '${nextTarget}')`,
        false,
        400
      );
    }

    visited.add(nextTarget.toLowerCase());
    current = nextTarget;
  }

  return { canonicalModelId: current, aliasUsed };
}

export function resolveModelContext(
  requestedId: string,
  models: readonly CanonicalModelEntity[],
  aliases: readonly ModelAliasEntity[],
  routes: readonly ProviderRouteEntity[],
  options: ResolveOptions = {}
): ResolvedModelContext {
  const maxHops = options.maxHops ?? 5;
  const { canonicalModelId, aliasUsed } = resolveAliasChain(requestedId, aliases, maxHops);

  // Exact canonical ID lookup
  const model = models.find(
    (m) =>
      m.canonicalId.toLowerCase() === canonicalModelId.toLowerCase() ||
      m.id.toLowerCase() === canonicalModelId.toLowerCase()
  );

  if (!model) {
    throw new GrowXProviderError(
      "model_not_found",
      `Model '${requestedId}' not found in canonical model registry`,
      false,
      404
    );
  }

  if (model.status === "disabled" && !options.allowDisabled) {
    throw new GrowXProviderError(
      "model_disabled",
      `Model '${model.canonicalId}' is currently disabled`,
      false,
      403
    );
  }

  if (model.status === "retired") {
    throw new GrowXProviderError(
      "model_retired",
      `Model '${model.canonicalId}' is retired and no longer available for execution`,
      false,
      410
    );
  }

  if (model.status === "draft" && !options.allowDraft) {
    throw new GrowXProviderError(
      "model_not_found",
      `Model '${model.canonicalId}' is in draft status and not available for execution`,
      false,
      404
    );
  }

  const modelRoutes = routes.filter(
    (r) => r.modelId === model.id || r.canonicalModelId === model.canonicalId
  );
  const eligibleRoutes = eligibleConfiguredRoutes(model, modelRoutes);
  const executable = isModelExecutable(model, modelRoutes);

  return {
    requestedModelId: requestedId,
    canonicalModelId: model.canonicalId,
    aliasUsed,
    model,
    capabilities: model.capabilities,
    limits: {
      contextWindow: model.contextWindow,
      maxInputTokens: model.maxInputTokens ?? null,
      maxOutputTokens: model.maxOutputTokens,
    },
    eligibleConfiguredRoutes: eligibleRoutes,
    isExecutable: executable,
    deprecation: model.deprecatedAt
      ? {
          deprecatedAt: model.deprecatedAt ? model.deprecatedAt.toISOString() : null,
          sunsetAt: model.sunsetAt ? model.sunsetAt.toISOString() : null,
          replacementModelId: model.replacementModelId ?? null,
          message: model.deprecationMessage ?? null,
        }
      : undefined,
  };
}
