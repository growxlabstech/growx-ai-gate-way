import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";
import { canonicalizeRequest } from "./canonicalizer.js";
import { buildExactCacheKey, CACHE_SCHEMA_VERSION } from "./key-builder.js";
import { evaluateCacheEligibility } from "./eligibility.js";
import type { ExactCacheStore } from "./store.js";
import { InMemoryExactCacheStore } from "./store.js";
import { SingleFlightGroup } from "./single-flight.js";
import {
  type CacheEntry,
  type CacheLookupResult,
  type CachePolicyConfig,
  type InvalidationFilter,
  DEFAULT_CACHE_POLICY_CONFIG,
} from "./types.js";

export interface CacheServiceOptions {
  store?: ExactCacheStore;
  config?: Partial<CachePolicyConfig>;
}

export class CacheService {
  public readonly store: ExactCacheStore;
  public readonly config: CachePolicyConfig;
  private readonly singleFlight = new SingleFlightGroup<CacheEntry | null>();
  private readonly executionFlight = new SingleFlightGroup<any>();

  constructor(options?: CacheServiceOptions) {
    this.store = options?.store ?? new InMemoryExactCacheStore();
    this.config = { ...DEFAULT_CACHE_POLICY_CONFIG, ...options?.config };
  }

  public async executeCoalesced<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ value: T; coalesced: boolean }> {
    const res = await this.executionFlight.run(
      key,
      this.config.singleFlightLeaseTtlMs,
      fn,
    );
    return { value: res.value, coalesced: res.deduplicated };
  }

  public evaluateEligibility(
    request: OpenAIChatCompletionRequest,
    modelContext?: { supportsStreaming?: boolean; category?: string },
  ) {
    return evaluateCacheEligibility(request, this.config, modelContext);
  }

  public deriveCacheKey(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModelId: string;
    modelVersion: string;
    policyFingerprint: string;
    request: OpenAIChatCompletionRequest;
    providerId?: string;
  }): { cacheKey: string; keyDigest: string; requestDigest: string } {
    const { requestDigest } = canonicalizeRequest(params.request);
    const { cacheKey, keyDigest } = buildExactCacheKey({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModelId: params.canonicalModelId,
      modelVersion: params.modelVersion,
      policyFingerprint: params.policyFingerprint,
      requestDigest,
      providerId: params.providerId,
    });

    return { cacheKey, keyDigest, requestDigest };
  }

  public async lookup(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModelId: string;
    modelVersion: string;
    policyFingerprint: string;
    request: OpenAIChatCompletionRequest;
    providerId?: string;
  }): Promise<CacheLookupResult> {
    const startMs = Date.now();

    // 1. Eligibility evaluation
    const eligibility = this.evaluateEligibility(params.request);
    if (!eligibility.eligible) {
      return {
        status: "BYPASS",
        bypassReason: eligibility.reason ?? "NOT_ELIGIBLE",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 2. Derive canonical key
    const { cacheKey, requestDigest } = this.deriveCacheKey(params);

    try {
      // 3. Lookup with single-flight stampede protection
      const inFlightResult = await this.singleFlight.run(
        cacheKey,
        this.config.singleFlightLeaseTtlMs,
        async () => {
          return await this.store.get(cacheKey);
        },
      );

      const durationMs = Date.now() - startMs;
      const entry = inFlightResult.value;

      if (!entry) {
        return {
          status: "MISS",
          cacheKey,
          lookupDurationMs: durationMs,
          isCoalesced: inFlightResult.deduplicated,
        };
      }

      // Check schema version and validity
      if (
        entry.cacheVersion !== CACHE_SCHEMA_VERSION ||
        !entry.responsePayload
      ) {
        await this.store.delete(cacheKey);
        return {
          status: "MISS",
          cacheKey,
          lookupDurationMs: durationMs,
        };
      }

      return {
        status: "HIT",
        entry,
        cacheKey,
        lookupDurationMs: durationMs,
        isCoalesced: inFlightResult.deduplicated,
      };
    } catch (err) {
      // Cache failure must fail open (optimization only)
      return {
        status: "MISS",
        cacheKey,
        lookupDurationMs: Date.now() - startMs,
      };
    }
  }

  public async admitAndStore(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModelId: string;
    modelVersion: string;
    policyFingerprint: string;
    request: OpenAIChatCompletionRequest;
    response: OpenAIChatCompletionResponse;
    sourceRequestId: string;
    ttlSeconds?: number;
    providerId?: string;
  }): Promise<boolean> {
    // 1. Admission criteria: must be successful response with choices
    if (!params.response.choices || params.response.choices.length === 0) {
      return false;
    }

    // 2. Derive key
    const { cacheKey, requestDigest } = this.deriveCacheKey(params);
    const serializedPayload = JSON.stringify(params.response);
    const sizeBytes = Buffer.byteLength(serializedPayload, "utf8");

    // 3. Max entry size check
    if (sizeBytes > this.config.maxEntrySizeBytes) {
      return false;
    }

    const ttlSeconds = Math.min(
      this.config.maxTtlSeconds,
      Math.max(1, params.ttlSeconds ?? this.config.defaultTtlSeconds),
    );

    const logicalUsage = params.response.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    const entry: CacheEntry = {
      id: cacheKey,
      cacheVersion: CACHE_SCHEMA_VERSION,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModelId: params.canonicalModelId,
      requestDigest,
      responsePayload: params.response,
      responseMetadata: {
        logicalUsage: {
          inputTokens: logicalUsage.prompt_tokens,
          outputTokens: logicalUsage.completion_tokens,
          totalTokens: logicalUsage.total_tokens,
          cachedInputTokens: (logicalUsage as any).prompt_tokens_details
            ?.cached_tokens,
          reasoningTokens: (logicalUsage as any).completion_tokens_details
            ?.reasoning_tokens,
        },
        finishReason: params.response.choices[0]?.finish_reason ?? "stop",
        model: params.response.model,
        created: params.response.created,
      },
      policyFingerprint: params.policyFingerprint,
      modelVersion: params.modelVersion,
      sizeBytes,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      sourceRequestId: params.sourceRequestId,
      hitCount: 0,
    };

    try {
      await this.store.set(entry, ttlSeconds);
      return true;
    } catch {
      return false;
    }
  }

  public async invalidate(filter: InvalidationFilter): Promise<number> {
    return await this.store.invalidate(filter);
  }

  public async getStats() {
    return await this.store.getStats();
  }
}
