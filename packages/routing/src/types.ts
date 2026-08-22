import type { CanonicalCapability, ModelCapability } from "@growx/contracts";

export type RoutingStrategy =
  | "priority"
  | "weighted"
  | "lowest_cost"
  | "lowest_latency"
  | "balanced"
  | "highest_reliability"
  | "explicit_provider";

export type RoutingMode = "NORMAL" | "DEGRADED" | "EMERGENCY";

export type ExclusionReasonCode =
  | "ROUTE_DISABLED"
  | "PROVIDER_DISABLED"
  | "NO_CREDENTIAL"
  | "CAPABILITY_MISMATCH"
  | "CONTEXT_LIMIT"
  | "OUTPUT_LIMIT"
  | "REGION_DENIED"
  | "PROVIDER_DENIED"
  | "MODEL_RESTRICTED"
  | "POLICY_DENIED"
  | "COST_LIMIT"
  | "UNAVAILABLE"
  | "NO_CAPACITY"
  | "CIRCUIT_OPEN";

export interface ScoreWeights {
  cost: number;
  latency: number;
  availability: number;
  priority: number;
  reliability?: number | undefined;
  capacity?: number | undefined;
  preference?: number | undefined;
}

export interface RouteCandidateLimits {
  contextWindow: number;
  maxOutputTokens: number;
  maxInputTokens?: number | null | undefined;
}

export interface RouteCandidateLatencySignal {
  p95LatencyMs: number;
  p50LatencyMs?: number | undefined;
  source: "telemetry" | "baseline" | "default";
  sampledAt?: Date | string | undefined;
}

export interface RouteCandidateAvailabilitySignal {
  available: boolean;
  successRate: number; // 0..1
  source: "telemetry" | "configured" | "default";
}

export interface RouteCandidateCapacitySignal {
  utilization: number; // 0..1
  state: "available" | "busy" | "near_limit" | "exhausted";
}

export interface RouteCandidatePricing {
  inputPricePerMillionMinor: number;
  outputPricePerMillionMinor: number;
  cachedInputPricePerMillionMinor?: number | null | undefined;
  reasoningPricePerMillionMinor?: number | null | undefined;
  currency: string;
}

export interface RouteCandidate {
  routeId: string;
  providerId: string;
  providerModelId: string;
  providerAccountId?: string | undefined;
  credentialId?: string | undefined;
  credentialVersionId?: string | undefined;
  accountType?: string | undefined;
  accountStatus?: string | undefined;
  accountRegion?: string | undefined;
  accountResidency?: string | undefined;
  credentialType?: string | undefined;
  credentialStatus?: string | undefined;
  poolId?: string | undefined;
  publicModelId?: string | undefined;
  region: string;
  priority: number;
  weight: number;
  capabilities: CanonicalCapability[] | ReadonlySet<ModelCapability>;
  limits?: RouteCandidateLimits | undefined;
  routeStatus: string;
  providerStatus: string;
  routingEligible: boolean;
  hasActiveCredential?: boolean | undefined;
  pricing?: RouteCandidatePricing | undefined;
  estimatedCost?: number | undefined;
  priceInputPerMillionMinor?: bigint | number | undefined;
  priceOutputPerMillionMinor?: bigint | number | undefined;
  latencySignal?: RouteCandidateLatencySignal | undefined;
  p95LatencyMs?: number | undefined;
  availabilitySignal?: RouteCandidateAvailabilitySignal | undefined;
  reliability?: number | undefined;
  successRate?: number | undefined;
  timeoutRate?: number | undefined;
  serverErrorRate?: number | undefined;
  rateLimitRate?: number | undefined;
  streamFailureRate?: number | undefined;
  capacitySignal?: RouteCandidateCapacitySignal | undefined;
  capacityUtilization?: number | undefined;
  capacityState?:
    "available" | "busy" | "near_limit" | "exhausted" | "unknown" | undefined;
  health?:
    | "healthy"
    | "degraded"
    | "unhealthy"
    | "unknown"
    | "maintenance"
    | undefined;
  circuit?:
    | "CLOSED"
    | "OPEN"
    | "HALF_OPEN"
    | "FORCED_OPEN"
    | "FORCED_CLOSED"
    | undefined;
  policyAttributes?: Record<string, unknown> | undefined;
}

export interface ConsideredRoute {
  routeId: string;
  providerId: string;
  providerModelId: string;
  region?: string | undefined;
  priority: number;
  weight: number;
  eligible: boolean;
  exclusionReason?: ExclusionReasonCode | undefined;
  score?: number | undefined;
  estimatedCost?: number | undefined;
}

export interface RouteTarget {
  routeId?: string | undefined;
  providerId: string;
  providerModelId: string;
  publicModelId?: string | undefined;
}

export interface RouteScore {
  routeId?: string | undefined;
  providerId: string;
  providerModelId: string;
  costScore: number;
  latencyScore: number;
  availabilityScore?: number | undefined;
  reliabilityScore?: number | undefined;
  capacityScore?: number | undefined;
  priorityScore: number;
  preferenceScore?: number | undefined;
  finalScore: number;
  eligible: boolean;
  rejectionReason?: string | ExclusionReasonCode | undefined;
  estimatedCostMinor?: bigint | number | undefined;
}

export interface RoutingDecision {
  id: string;
  requestId: string;
  strategy: RoutingStrategy;
  canonicalModelId: string;
  selectedRouteId: string;
  selectedProviderId: string;
  selectedProviderModelId: string;
  selectedCredentialReference?: string | undefined;
  candidateCount: number;
  eligibleCandidateCount: number;
  consideredRoutes: ConsideredRoute[];
  reasons: string[];
  score?: number | undefined;
  fallbackChain: RouteTarget[];
  scoreBreakdown?: readonly RouteScore[] | undefined;
  decisionAt: Date;
  policyId?: string | undefined;
  policyVersion?: number | string | undefined;
}

export interface AdvancedRoutingDecision {
  id: string;
  requestId: string;
  requestedModel: string;
  resolvedModel: string;
  strategy: RoutingStrategy;
  primary: RouteCandidate;
  fallbackChain: readonly RouteCandidate[] | readonly RouteTarget[];
  scoreBreakdown: readonly RouteScore[];
  policyId: string;
  policyVersion: number | string;
  reason: string;
  createdAt: string;
}

export interface RoutingConstraints {
  allowedProviders?: readonly string[] | undefined;
  deniedProviders?: readonly string[] | undefined;
  allowedRegions?: readonly string[] | undefined;
  deniedRegions?: readonly string[] | undefined;
  requiredRegion?: string | undefined;
  dataRegion?: string | undefined;
  region?: string | undefined;
  maxCostMinor?: bigint | number | undefined;
  maxEstimatedProviderCost?: number | undefined;
  maxLatencyMs?: number | undefined;
  minimumContext?: number | undefined;
  preferredProviders?: readonly string[] | undefined;
  providerPriorities?: Record<string, number> | undefined;
  providerWeights?: Record<string, number> | undefined;
}

export interface RoutingPolicy {
  id: string;
  organizationId?: string | null | undefined;
  workspaceId?: string | null | undefined;
  name: string;
  level?:
    | "global"
    | "plan"
    | "organization"
    | "workspace"
    | "environment"
    | "apiKey"
    | "request"
    | undefined;
  strategy: RoutingStrategy;
  allowedProviders?: string[] | undefined;
  deniedProviders?: string[] | undefined;
  allowedRegions?: string[] | undefined;
  deniedRegions?: string[] | undefined;
  preferredProviders?: string[] | undefined;
  requiredRegion?: string | undefined;
  dataRegion?: string | undefined; // data residency constraint
  maxEstimatedProviderCost?: number | undefined;
  weights?: ScoreWeights | undefined;
  sticky?: boolean | undefined;
  providerPriorities?: Record<string, number> | undefined;
  providerWeights?: Record<string, number> | undefined;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: number;
  level:
    | "global"
    | "plan"
    | "organization"
    | "workspace"
    | "environment"
    | "apiKey"
    | "request";
  strategy: RoutingStrategy;
  weights: ScoreWeights;
  status: "draft" | "active" | "superseded" | "archived";
  constraints?: RoutingConstraints | undefined;
}

export interface RoutingRequest {
  requestId: string;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  environmentId?: string | undefined;
  apiKeyId?: string | undefined;
  requestedModel: string;
  canonicalModelId?: string | undefined;
  capabilities: readonly CanonicalCapability[] | readonly ModelCapability[];
  stream: boolean;
  estimatedInputTokens?: number | undefined;
  estimatedOutputTokens?: number | undefined;
  requestedTokens?: number | undefined;
  stableKey?: string | undefined;
  constraints?: RoutingConstraints | undefined;
  hints?:
    | {
        preferLowCost?: boolean | undefined;
        preferLowLatency?: boolean | undefined;
        preferredProvider?: string | undefined;
      }
    | undefined;
}

export interface RankedCandidate {
  candidate: RouteCandidate;
  score: number;
  scores: RouteScore;
  reasons: string[];
}
