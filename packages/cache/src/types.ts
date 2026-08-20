import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";

export type CacheStatus = "HIT" | "MISS" | "BYPASS" | "STORE" | "ERROR";

export type CacheBypassReason =
  | "NOT_ELIGIBLE"
  | "DISABLED"
  | "NON_DETERMINISTIC"
  | "TOOLS_UNSAFE"
  | "MULTIMODAL_UNSTABLE"
  | "OVERSIZED"
  | "POLICY_DISABLED"
  | "MODEL_DISABLED"
  | "CLIENT_NO_CACHE";

export interface CacheEligibilityDecision {
  eligible: boolean;
  reason?: CacheBypassReason | undefined;
  ttlSeconds?: number | undefined;
  scope: "workspace" | "organization" | "none";
}

export interface CachePolicyConfig {
  enabled: boolean;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  maxEntrySizeBytes: number;
  deterministicOnly: boolean;
  allowedModels?: string[] | undefined;
  allowStreaming: boolean;
  singleFlightLeaseTtlMs: number;
  followerWaitTimeoutMs: number;
  lookupTimeoutMs: number;
}

export const DEFAULT_CACHE_POLICY_CONFIG: CachePolicyConfig = {
  enabled: true,
  defaultTtlSeconds: 3600, // 1 hour
  maxTtlSeconds: 86400 * 7, // 7 days
  maxEntrySizeBytes: 512 * 1024, // 512 KB
  deterministicOnly: true,
  allowStreaming: true,
  singleFlightLeaseTtlMs: 10000, // 10s
  followerWaitTimeoutMs: 15000, // 15s
  lookupTimeoutMs: 250, // 250ms fast lookup timeout
};

export interface CacheEntry {
  id: string; // The canonical cache key
  cacheVersion: number;
  organizationId: string;
  workspaceId: string;
  canonicalModelId: string;
  requestDigest: string;
  responsePayload: OpenAIChatCompletionResponse;
  responseMetadata: {
    logicalUsage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cachedInputTokens?: number | undefined;
      reasoningTokens?: number | undefined;
    };
    finishReason: string;
    model: string;
    created: number;
  };
  policyFingerprint: string;
  modelVersion: string;
  sizeBytes: number;
  createdAt: Date;
  expiresAt: Date;
  sourceRequestId: string;
  hitCount: number;
  lastAccessedAt?: Date | undefined;
}

export interface CacheLookupResult {
  status: "HIT" | "MISS" | "BYPASS";
  entry?: CacheEntry | undefined;
  bypassReason?: CacheBypassReason | undefined;
  cacheKey?: string | undefined;
  lookupDurationMs: number;
  isCoalesced?: boolean | undefined;
}

export interface InvalidationFilter {
  organizationId: string;
  workspaceId?: string | undefined;
  canonicalModelId?: string | undefined;
  cacheKey?: string | undefined;
}

/**
 * Interface boundary placeholder for future Semantic / Vector cache
 */
export interface SemanticCacheProvider {
  lookup(tenantScope: string, embedding: readonly number[], similarityThreshold: number): Promise<CacheEntry | null>;
  store(tenantScope: string, embedding: readonly number[], entry: CacheEntry): Promise<void>;
}
