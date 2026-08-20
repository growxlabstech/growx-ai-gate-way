import type {
  CanonicalCapability,
  MachineAuthContext,
} from "@growx/contracts";
import type {
  CanonicalModelEntity,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "@growx/model-registry-service";
import type {
  ExclusionReasonCode,
  RankedCandidate,
  RouteCandidate,
  RoutingConstraints,
  RoutingDecision,
  RoutingPolicy,
  RoutingRequest,
  RoutingStrategy,
} from "@growx/routing";

export * from "@growx/routing";

export interface LatencySignal {
  providerId: string;
  providerModelId: string;
  region?: string | undefined;
  p95LatencyMs: number;
  p50LatencyMs?: number | undefined;
  source: "telemetry" | "baseline" | "default";
  sampledAt: Date;
}

export interface AvailabilitySignal {
  providerId: string;
  providerModelId?: string | undefined;
  available: boolean;
  successRate: number; // 0..1
  source: "telemetry" | "configured" | "default";
  sampledAt?: Date | undefined;
}

export interface RoutingEngineContext {
  requestId: string;
  auth: MachineAuthContext;
  resolvedModel: ResolvedModelContext;
  requiredCapabilities: CanonicalCapability[];
  stream: boolean;
  estimatedInputTokens?: number | undefined;
  estimatedOutputTokens?: number | undefined;
  constraints?: RoutingConstraints | undefined;
  hints?: {
    preferLowCost?: boolean | undefined;
    preferLowLatency?: boolean | undefined;
    preferredProvider?: string | undefined;
  } | undefined;
  stableKey?: string | undefined;
}

export interface ResolvedGatewayRoute {
  canonicalModel: CanonicalModelEntity;
  route: ProviderRouteEntity;
  activeAlias?: { alias: string; type: string } | undefined;
  requestedModelId: string;
  canonicalModelId: string;
  requiredCapabilities: CanonicalCapability[];
  routingDecision?: RoutingDecision | undefined;
}
