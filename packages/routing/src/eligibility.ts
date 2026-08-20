import type {
  ExclusionReasonCode,
  RouteCandidate,
  RoutingConstraints,
  RoutingPolicy,
  RoutingRequest,
} from "./types.js";

export interface EligibilityResult {
  eligible: boolean;
  exclusionReason?: ExclusionReasonCode | undefined;
}

/**
 * Checks whether a candidate supports a given capability.
 */
function candidateSupportsCapability(
  candidate: RouteCandidate,
  cap: string
): boolean {
  if (candidate.capabilities instanceof Set) {
    return candidate.capabilities.has(cap as any);
  }
  if (Array.isArray(candidate.capabilities)) {
    return candidate.capabilities.includes(cap as any);
  }
  return false;
}

/**
 * Evaluate hard eligibility filters for a candidate route against a routing request and policy.
 *
 * Checks are executed in strict order:
 * 1. Route status & eligibility
 * 2. Provider status & operational state
 * 3. Credential availability
 * 4. Required capability matching
 * 5. Context window & max output token limits
 * 6. Tenant policy provider allow/deny rules (deny overrides allow)
 * 7. Tenant policy regional & data residency constraints
 * 8. Cost limits
 */
export function evaluateEligibility(
  candidate: RouteCandidate,
  request: RoutingRequest,
  policy?: RoutingPolicy | RoutingConstraints | undefined,
  estimatedCost?: number | undefined
): EligibilityResult {
  // 1. Route status & routingEligible flag
  if (candidate.routingEligible === false) {
    return { eligible: false, exclusionReason: "ROUTE_DISABLED" };
  }
  if (
    candidate.routeStatus === "disabled" ||
    candidate.routeStatus === "retired"
  ) {
    return { eligible: false, exclusionReason: "ROUTE_DISABLED" };
  }

  // 2. Provider status & operational state
  if (
    candidate.providerStatus === "disabled" ||
    candidate.providerStatus === "retired" ||
    candidate.providerStatus === "maintenance" ||
    candidate.providerStatus === "unavailable"
  ) {
    return { eligible: false, exclusionReason: "PROVIDER_DISABLED" };
  }
  if (candidate.health === "unhealthy" || candidate.health === "maintenance") {
    return { eligible: false, exclusionReason: "UNAVAILABLE" };
  }
  if (candidate.circuit === "OPEN" || candidate.circuit === "FORCED_OPEN") {
    return { eligible: false, exclusionReason: "CIRCUIT_OPEN" };
  }
  if (
    candidate.capacityState === "exhausted" ||
    (candidate.capacitySignal && candidate.capacitySignal.state === "exhausted")
  ) {
    return { eligible: false, exclusionReason: "NO_CAPACITY" };
  }

  // 3. Credential availability
  if (candidate.hasActiveCredential === false) {
    return { eligible: false, exclusionReason: "NO_CREDENTIAL" };
  }

  // 4. Capability matching
  if (request.capabilities && request.capabilities.length > 0) {
    for (const cap of request.capabilities) {
      if (!candidateSupportsCapability(candidate, cap as string)) {
        return { eligible: false, exclusionReason: "CAPABILITY_MISMATCH" };
      }
    }
  }

  // 5. Context / Output Limit Filter
  if (candidate.limits) {
    const { contextWindow, maxOutputTokens, maxInputTokens } = candidate.limits;
    if (
      request.estimatedInputTokens !== undefined &&
      maxInputTokens !== undefined &&
      maxInputTokens !== null &&
      request.estimatedInputTokens > maxInputTokens
    ) {
      return { eligible: false, exclusionReason: "CONTEXT_LIMIT" };
    }
    if (
      request.estimatedInputTokens !== undefined &&
      contextWindow !== undefined &&
      request.estimatedInputTokens > contextWindow
    ) {
      return { eligible: false, exclusionReason: "CONTEXT_LIMIT" };
    }
    if (
      request.estimatedOutputTokens !== undefined &&
      maxOutputTokens !== undefined &&
      request.estimatedOutputTokens > maxOutputTokens
    ) {
      return { eligible: false, exclusionReason: "OUTPUT_LIMIT" };
    }
  }

  const minContext = request.constraints?.minimumContext;
  if (minContext && candidate.limits && candidate.limits.contextWindow < minContext) {
    return { eligible: false, exclusionReason: "CONTEXT_LIMIT" };
  }

  // Extract constraints from policy and request
  const deniedProviders = [
    ...(policy?.deniedProviders ?? []),
    ...(request.constraints?.deniedProviders ?? []),
  ];
  const allowedProviders = policy?.allowedProviders ?? request.constraints?.allowedProviders;

  const deniedRegions = [
    ...(policy?.deniedRegions ?? []),
    ...(request.constraints?.deniedRegions ?? []),
  ];
  const allowedRegions = policy?.allowedRegions ?? request.constraints?.allowedRegions;
  const requiredRegion =
    (policy as RoutingPolicy)?.requiredRegion ??
    (policy as RoutingPolicy)?.dataRegion ??
    request.constraints?.requiredRegion ??
    request.constraints?.dataRegion ??
    request.constraints?.region;

  // 6. Tenant Provider Policies (Deny overrides allow)
  if (deniedProviders.includes(candidate.providerId)) {
    return { eligible: false, exclusionReason: "PROVIDER_DENIED" };
  }
  if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(candidate.providerId)) {
    return { eligible: false, exclusionReason: "PROVIDER_DENIED" };
  }

  // 7. Regional & Data Residency Constraints
  const candRegion = candidate.region ?? "global";
  if (deniedRegions.includes(candRegion)) {
    return { eligible: false, exclusionReason: "REGION_DENIED" };
  }
  if (
    allowedRegions &&
    allowedRegions.length > 0 &&
    candRegion !== "global" &&
    !allowedRegions.includes(candRegion)
  ) {
    return { eligible: false, exclusionReason: "REGION_DENIED" };
  }
  if (
    requiredRegion &&
    candRegion !== "global" &&
    candRegion !== requiredRegion
  ) {
    return { eligible: false, exclusionReason: "REGION_DENIED" };
  }

  // 8. Cost Limits
  const maxCost =
    (policy as RoutingPolicy)?.maxEstimatedProviderCost ??
    request.constraints?.maxEstimatedProviderCost;
  if (maxCost !== undefined && estimatedCost !== undefined && estimatedCost > maxCost) {
    return { eligible: false, exclusionReason: "COST_LIMIT" };
  }

  const maxCostMinor = request.constraints?.maxCostMinor;
  if (
    maxCostMinor !== undefined &&
    candidate.estimatedCost !== undefined &&
    BigInt(Math.floor(candidate.estimatedCost * 100)) > BigInt(maxCostMinor)
  ) {
    return { eligible: false, exclusionReason: "COST_LIMIT" };
  }

  // 9. Latency Constraints
  const maxLatencyMs = request.constraints?.maxLatencyMs;
  const latency = candidate.latencySignal?.p95LatencyMs ?? candidate.p95LatencyMs;
  if (maxLatencyMs !== undefined && latency !== undefined && latency > maxLatencyMs) {
    return { eligible: false, exclusionReason: "UNAVAILABLE" };
  }

  return { eligible: true };
}
