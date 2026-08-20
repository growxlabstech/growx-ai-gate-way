import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "./canonicalizer.js";

export const CACHE_SCHEMA_VERSION = 1;

export interface CacheKeyParams {
  organizationId: string;
  workspaceId: string;
  canonicalModelId: string;
  modelVersion: string;
  policyFingerprint: string;
  requestDigest: string;
  providerId?: string | undefined;
}

export function buildExactCacheKey(params: CacheKeyParams): {
  cacheKey: string;
  keyDigest: string;
} {
  const envelope = {
    v: CACHE_SCHEMA_VERSION,
    org: params.organizationId,
    ws: params.workspaceId,
    model: params.canonicalModelId,
    mv: params.modelVersion,
    pol: params.policyFingerprint,
    req: params.requestDigest,
    prov: params.providerId ?? "",
  };

  const keyDigest = createHash("sha256")
    .update(canonicalJsonStringify(envelope), "utf8")
    .digest("hex");

  // Namespace: cache:exact:v1:{orgId}:{workspaceId}:{canonicalModelId}:{keyDigest}
  const cacheKey = `cache:exact:v1:${params.organizationId}:${params.workspaceId}:${params.canonicalModelId}:${keyDigest}`;

  return { cacheKey, keyDigest };
}
