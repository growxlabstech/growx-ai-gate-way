import type { ModelCapability } from "@growx/contracts";
import type { ModelRecord, ModelRegistry } from "@growx/model-registry-service";

export type ProviderHealth =
  "healthy" | "degraded" | "unhealthy" | "unknown" | "maintenance";

export interface LegacyRouteTarget {
  providerId: string;
  providerModelId: string;
  publicModelId: string;
}

export interface RoutingInput {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  requestedModel: string;
  requiredCapabilities: readonly ModelCapability[];
  routingPolicyId?: string;
}

export interface LegacyRoutingDecision {
  decisionId: string;
  requestedModel: string;
  resolvedModel: string;
  providerId: string;
  providerModelId: string;
  fallbackChain: readonly LegacyRouteTarget[];
  policyVersion: string;
  reason: string;
}

export interface ProviderState {
  id: string;
  health: ProviderHealth;
  enabled: boolean;
  priority: number;
}

export class RoutingService {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly providers: readonly ProviderState[],
    private readonly id: () => string,
  ) {}

  decide(input: RoutingInput): LegacyRoutingDecision {
    const candidates = this.registry
      .resolve(input.requestedModel)
      .filter((model) => this.available(model))
      .sort(
        (a, b) => this.priority(a.providerId) - this.priority(b.providerId),
      );

    for (const model of candidates)
      this.registry.requireCapabilities(model, input.requiredCapabilities);

    const primary = candidates[0];
    if (!primary)
      throw Object.assign(new Error("No available route"), {
        code: "model_unavailable",
      });

    const target = (model: ModelRecord): LegacyRouteTarget => ({
      providerId: model.providerId,
      providerModelId: model.providerModelId,
      publicModelId: model.publicModelId,
    });

    return {
      decisionId: this.id(),
      requestedModel: input.requestedModel,
      resolvedModel: primary.publicModelId,
      providerId: primary.providerId,
      providerModelId: primary.providerModelId,
      fallbackChain: candidates.slice(1).map(target),
      policyVersion: "phase4-v1",
      reason: input.requestedModel.startsWith("growx/")
        ? "active_alias_priority"
        : "explicit_model",
    };
  }

  private available(model: ModelRecord) {
    const provider = this.providers.find(
      (value) => value.id === model.providerId,
    );
    return Boolean(
      provider?.enabled &&
      !["unhealthy", "maintenance"].includes(provider.health),
    );
  }

  private priority(id: string) {
    return (
      this.providers.find((value) => value.id === id)?.priority ??
      Number.MAX_SAFE_INTEGER
    );
  }
}
