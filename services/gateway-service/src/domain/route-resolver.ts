import {
  type CanonicalCapability,
  GrowXProviderError,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";
import type {
  CanonicalModelEntity,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "@growx/model-registry-service";
import type { RoutingEngine } from "@growx/routing-service";
import type { ResolvedGatewayRoute } from "./types.js";

export function validateModelCapabilities(
  model: CanonicalModelEntity,
  requiredCapabilities: readonly CanonicalCapability[]
): void {
  for (const cap of requiredCapabilities) {
    if (cap === "streaming" && !model.supportsStreaming) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        `Model '${model.canonicalId}' does not support streaming`,
        false,
        400
      );
    }
    if (cap === "tools.call" && !model.supportsTools) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        `Model '${model.canonicalId}' does not support tool calling`,
        false,
        400
      );
    }
    if (cap === "structured_output" && !model.supportsStructuredOutput) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        `Model '${model.canonicalId}' does not support structured output`,
        false,
        400
      );
    }
    if (cap === "text.reason" && !model.supportsReasoning) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        `Model '${model.canonicalId}' does not support reasoning effort`,
        false,
        400
      );
    }
    if (cap === "vision.input" && !model.inputModalities?.includes("image")) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        `Model '${model.canonicalId}' does not support image/vision inputs`,
        false,
        400
      );
    }
    if (!["streaming", "tools.call", "structured_output", "text.reason", "vision.input"].includes(cap)) {
      if (!model.capabilities?.includes(cap)) {
        throw new GrowXProviderError(
          "model_capability_not_supported",
          `Model '${model.canonicalId}' does not support ${cap}`,
          false,
          400
        );
      }
    }
  }
}

export function routeSupportsCapability(
  route: ProviderRouteEntity,
  model: CanonicalModelEntity,
  capability: CanonicalCapability
): boolean {
  if (route.capabilitiesOverrides && route.capabilitiesOverrides.length > 0) {
    return route.capabilitiesOverrides.includes(capability);
  }
  return model.capabilities.includes(capability);
}

export interface RouteResolutionContext {
  requestId?: string | undefined;
  auth?: MachineAuthContext | undefined;
  stream?: boolean | undefined;
  estimatedInputTokens?: number | undefined;
  estimatedOutputTokens?: number | undefined;
  constraints?: any | undefined;
  hints?: any | undefined;
}

export interface IRouteResolver {
  resolveRoute(
    resolvedModel: ResolvedModelContext,
    requiredCapabilities: CanonicalCapability[],
    context?: RouteResolutionContext | undefined
  ): Promise<ResolvedGatewayRoute> | ResolvedGatewayRoute;
}

export class DeterministicRouteResolver implements IRouteResolver {
  resolveRoute(
    resolvedModel: ResolvedModelContext,
    requiredCapabilities: CanonicalCapability[],
    _context?: RouteResolutionContext
  ): ResolvedGatewayRoute {
    const { model, eligibleConfiguredRoutes, requestedModelId, activeAlias } =
      resolvedModel as ResolvedModelContext & { activeAlias?: any };

    // 1. Validate Canonical Model Capabilities
    validateModelCapabilities(model, requiredCapabilities);

    // 2. Filter Candidate Routes by Active Status, Routing Eligibility, and Capabilities
    const candidates = eligibleConfiguredRoutes.filter((r) => {
      if (r.status !== "active" || !r.routingEligible) {
        return false;
      }
      return requiredCapabilities.every((cap) =>
        routeSupportsCapability(r, model, cap)
      );
    });

    if (candidates.length === 0) {
      throw new GrowXProviderError(
        "model_unavailable",
        `No eligible provider routes available for model '${model.canonicalId}' matching requested capabilities [${requiredCapabilities.join(", ")}]`,
        false,
        503
      );
    }

    // 3. Deterministic Selection: First stable eligible route
    const primaryRoute = (candidates as ProviderRouteEntity[]).find((r) => (r as any).isPrimary);
    const selectedRoute = primaryRoute ?? candidates[0]!;

    return {
      canonicalModel: model,
      route: selectedRoute,
      activeAlias,
      requestedModelId,
      canonicalModelId: model.canonicalId,
      requiredCapabilities,
    };
  }
}

export class RoutingEngineRouteResolver implements IRouteResolver {
  constructor(private readonly engine: RoutingEngine) {}

  async resolveRoute(
    resolvedModel: ResolvedModelContext,
    requiredCapabilities: CanonicalCapability[],
    context?: RouteResolutionContext
  ): Promise<ResolvedGatewayRoute> {
    if (!context?.auth) {
      return new DeterministicRouteResolver().resolveRoute(
        resolvedModel,
        requiredCapabilities,
        context
      );
    }

    // 1. Validate Canonical Model Capabilities
    validateModelCapabilities(resolvedModel.model, requiredCapabilities);

    // 2. Route via intelligent RoutingEngine
    const result = await this.engine.route({
      requestId: context.requestId ?? `req_${Date.now()}`,
      auth: context.auth as any,
      resolvedModel,
      requiredCapabilities,
      stream: context.stream ?? false,
      estimatedInputTokens: context.estimatedInputTokens,
      estimatedOutputTokens: context.estimatedOutputTokens,
      constraints: context.constraints,
      hints: context.hints,
    });

    return {
      canonicalModel: result.canonicalModel,
      route: result.selectedRoute,
      activeAlias: (resolvedModel as any).activeAlias,
      requestedModelId: resolvedModel.requestedModelId,
      canonicalModelId: resolvedModel.canonicalModelId,
      requiredCapabilities,
      routingDecision: result.decision,
    };
  }
}
