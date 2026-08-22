import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";
import type { CacheService } from "../cache-service.js";
import type { SemanticCacheService } from "./semantic-cache-service.js";

export interface RequestOptimizationParams {
  organizationId: string;
  workspaceId: string;
  canonicalModelId: string;
  modelVersion: string;
  policyFingerprint: string;
  policyVersion?: number | undefined;
  request: OpenAIChatCompletionRequest;
  providerId?: string | undefined;
}

export interface OptimizationResult {
  status: "HIT" | "MISS" | "BYPASS";
  cacheType?: "exact" | "semantic" | undefined;
  responsePayload?: OpenAIChatCompletionResponse | undefined;
  cacheKey?: string | undefined;
  similarity?: number | undefined;
  durationMs: number;
}

export class RequestOptimizationService {
  constructor(
    public readonly exactCache: CacheService,
    public readonly semanticCache: SemanticCacheService,
  ) {}

  /**
   * Orchestrates the exact-before-semantic optimization pipeline.
   */
  async optimizeRequest(
    params: RequestOptimizationParams,
  ): Promise<OptimizationResult> {
    const startMs = Date.now();

    // 1. Stage 1: Exact Cache Check (Deterministic & zero embedding overhead)
    const exactLookupParams: any = {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModelId: params.canonicalModelId,
      modelVersion: params.modelVersion,
      policyFingerprint: params.policyFingerprint,
      request: params.request,
    };
    if (params.providerId !== undefined) {
      exactLookupParams.providerId = params.providerId;
    }

    const exactLookup = await this.exactCache.lookup(exactLookupParams);

    if (exactLookup.status === "HIT" && exactLookup.entry) {
      return {
        status: "HIT",
        cacheType: "exact",
        responsePayload: exactLookup.entry.responsePayload,
        cacheKey: exactLookup.cacheKey,
        durationMs: Date.now() - startMs,
      };
    }

    // 2. Stage 2: Semantic Cache Check
    const semanticLookup = await this.semanticCache.lookup({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModel: params.canonicalModelId,
      policyVersion: params.policyVersion,
      request: params.request,
    });

    if (semanticLookup.status === "HIT" && semanticLookup.entry) {
      return {
        status: "HIT",
        cacheType: "semantic",
        responsePayload: semanticLookup.entry.responsePayload,
        similarity: semanticLookup.similarity,
        durationMs: Date.now() - startMs,
      };
    }

    return {
      status: "MISS",
      durationMs: Date.now() - startMs,
    };
  }

  /**
   * Admits a successful completion into both exact and semantic caches.
   */
  async admitResponse(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModelId: string;
    modelVersion: string;
    policyFingerprint: string;
    policyVersion?: number | undefined;
    request: OpenAIChatCompletionRequest;
    response: OpenAIChatCompletionResponse;
    sourceRequestId: string;
    ttlSeconds?: number | undefined;
    providerId?: string | undefined;
  }): Promise<void> {
    // 1. Store into Exact Cache
    const exactParams: any = {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModelId: params.canonicalModelId,
      modelVersion: params.modelVersion,
      policyFingerprint: params.policyFingerprint,
      request: params.request,
      response: params.response,
      sourceRequestId: params.sourceRequestId,
    };
    if (params.ttlSeconds !== undefined)
      exactParams.ttlSeconds = params.ttlSeconds;
    if (params.providerId !== undefined)
      exactParams.providerId = params.providerId;

    await this.exactCache.admitAndStore(exactParams).catch(() => {});

    // 2. Store into Semantic Cache
    await this.semanticCache
      .admitAndStore({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        canonicalModel: params.canonicalModelId,
        policyVersion: params.policyVersion,
        request: params.request,
        response: params.response,
        sourceRequestId: params.sourceRequestId,
        ttlSeconds: params.ttlSeconds,
      })
      .catch(() => {});
  }
}
