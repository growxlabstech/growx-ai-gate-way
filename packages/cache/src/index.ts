import { canonicalizeRequest } from "./canonicalizer.js";
import { buildExactCacheKey } from "./key-builder.js";
import { SingleFlightGroup } from "./single-flight.js";

export * from "./types.js";
export * from "./canonicalizer.js";
export * from "./key-builder.js";
export * from "./eligibility.js";
export * from "./store.js";
export * from "./single-flight.js";
export * from "./stream-replay.js";
export * from "./cache-service.js";

// Semantic Cache Exports (Phase 24)
export * from "./semantic/types.js";
export * from "./semantic/normalization.js";
export * from "./semantic/eligibility.js";
export * from "./semantic/embedding-provider.js";
export * from "./semantic/candidate-validator.js";
export * from "./semantic/vector-store.js";
export * from "./semantic/semantic-cache-service.js";
export * from "./semantic/request-optimization-service.js";

// Backward compatibility exports
export const LocalInFlightStore = SingleFlightGroup;
export type InFlightStore<T> = SingleFlightGroup<T>;

export function cacheEligible(request: any, explicitlyAllowed: boolean): boolean {
  return (
    explicitlyAllowed &&
    !request.stream &&
    (request.generation ? request.generation.temperature === 0 : (request.temperature ?? 0) === 0) &&
    !request.tools?.length &&
    !request.metadata &&
    !request.reasoning
  );
}

export function requestFingerprint(request: any, tenantScope: string, modelVersion: string): string {
  const { requestDigest } = canonicalizeRequest({
    model: request.model,
    messages: typeof request.input === "string" ? [{ role: "user", content: request.input }] : request.messages ?? [],
    temperature: request.generation?.temperature ?? request.temperature ?? 0,
    tools: request.tools,
  } as any);
  return buildExactCacheKey({
    organizationId: tenantScope,
    workspaceId: tenantScope,
    canonicalModelId: request.model,
    modelVersion,
    policyFingerprint: "default",
    requestDigest,
  }).keyDigest;
}
