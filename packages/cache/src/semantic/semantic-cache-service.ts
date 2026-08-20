import { generateId } from "@growx/ids";
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";
import {
  evaluateSemanticCacheEligibility,
} from "./eligibility.js";
import {
  DeterministicEmbeddingProvider,
} from "./embedding-provider.js";
import {
  extractSemanticInput,
  sha256,
} from "./normalization.js";
import {
  SemanticCacheCandidateValidator,
} from "./candidate-validator.js";
import {
  InMemorySemanticVectorStore,
  type SemanticInvalidationFilter,
  type SemanticVectorStore,
} from "./vector-store.js";
import {
  DEFAULT_SEMANTIC_CACHE_POLICY,
  type EmbeddingProvider,
  type SemanticCacheEntry,
  type SemanticCacheLookupResult,
  type SemanticCachePolicy,
} from "./types.js";

export interface SemanticCacheServiceOptions {
  vectorStore?: SemanticVectorStore | undefined;
  embeddingProvider?: EmbeddingProvider | undefined;
  policy?: Partial<SemanticCachePolicy> | undefined;
}

export class SemanticCacheService {
  public readonly vectorStore: SemanticVectorStore;
  public readonly embeddingProvider: EmbeddingProvider;
  public policy: SemanticCachePolicy;
  private isKillSwitchActive = false;

  constructor(options?: SemanticCacheServiceOptions) {
    this.vectorStore = options?.vectorStore ?? new InMemorySemanticVectorStore();
    this.embeddingProvider =
      options?.embeddingProvider ?? new DeterministicEmbeddingProvider();
    this.policy = { ...DEFAULT_SEMANTIC_CACHE_POLICY, ...options?.policy };
  }

  public setKillSwitch(active: boolean): void {
    this.isKillSwitchActive = active;
  }

  public setShadowMode(enabled: boolean): void {
    this.policy.shadowMode = enabled;
  }

  /**
   * Performs tenant-isolated semantic cache lookup.
   */
  public async lookup(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModel: string;
    policyVersion?: number | undefined;
    request: OpenAIChatCompletionRequest;
  }): Promise<SemanticCacheLookupResult> {
    const startMs = Date.now();

    // 1. Global Kill Switch Check
    if (this.isKillSwitchActive || !this.policy.enabled) {
      return {
        status: "BYPASS",
        missReason: "disabled",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 2. Eligibility Evaluation
    const eligibility = evaluateSemanticCacheEligibility(
      params.request,
      this.policy
    );
    if (!eligibility.eligible) {
      return {
        status: "BYPASS",
        missReason: eligibility.reason ?? "ineligible",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 3. Normalization and Namespace Derivation
    const norm = extractSemanticInput({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModel: params.canonicalModel,
      policyVersion: params.policyVersion,
      request: params.request,
    });

    // 4. Generate Embedding with strict low-latency budget
    let queryEmbedding: readonly number[];
    try {
      queryEmbedding = await Promise.race([
        this.embeddingProvider.embed(norm.semanticText),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Embedding generation timed out")),
            this.policy.lookupTimeoutMs
          )
        ),
      ]);
    } catch {
      // Embedding failure must fail open (optimization only)
      return {
        status: "MISS",
        missReason: "embedding_failure",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 5. Vector Search in Tenant Namespace
    let matches;
    try {
      matches = await this.vectorStore.query({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        namespaceHash: norm.namespaceHash,
        embedding: queryEmbedding,
        minSimilarity: this.policy.similarityThreshold,
        limit: 5,
      });
    } catch {
      return {
        status: "MISS",
        missReason: "timeout",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    if (!matches || matches.length === 0) {
      return {
        status: "MISS",
        missReason: "no_candidates",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 6. Secondary Deterministic Safety Validation
    const validationContext = {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModel: params.canonicalModel,
      systemPromptHash: norm.systemPromptHash,
      policyVersion: params.policyVersion,
      parametersHash: norm.parametersHash,
      responseFormatHash: norm.responseFormatHash,
      rawUserText: norm.userPrompt,
    };

    let bestMatch;
    for (const match of matches) {
      const validation = SemanticCacheCandidateValidator.validate(
        match.entry,
        validationContext
      );
      if (validation.valid) {
        bestMatch = match;
        break;
      }
    }

    if (!bestMatch) {
      return {
        status: "MISS",
        missReason: "policy_mismatch",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 7. Shadow Mode Check
    if (this.policy.shadowMode) {
      return {
        status: "MISS",
        isShadowHit: true,
        similarity: bestMatch.similarity,
        missReason: "shadow_mode",
        lookupDurationMs: Date.now() - startMs,
      };
    }

    // 8. HIT: Update access metrics
    const now = new Date();
    await this.vectorStore.update(bestMatch.entry.id, {
      hitCount: bestMatch.entry.hitCount + 1,
      lastHitAt: now,
    });

    return {
      status: "HIT",
      entry: bestMatch.entry,
      similarity: bestMatch.similarity,
      lookupDurationMs: Date.now() - startMs,
    };
  }

  /**
   * Admits and persists a verified completion into the semantic cache.
   */
  public async admitAndStore(params: {
    organizationId: string;
    workspaceId: string;
    canonicalModel: string;
    policyVersion?: number | undefined;
    request: OpenAIChatCompletionRequest;
    response: OpenAIChatCompletionResponse;
    sourceRequestId: string;
    ttlSeconds?: number | undefined;
  }): Promise<boolean> {
    if (this.isKillSwitchActive || !this.policy.enabled) {
      return false;
    }

    // 1. Admission Criteria: response must have valid non-empty choices
    if (!params.response.choices || params.response.choices.length === 0) {
      return false;
    }

    // 2. Check Request Eligibility
    const eligibility = evaluateSemanticCacheEligibility(
      params.request,
      this.policy
    );
    if (!eligibility.eligible) {
      return false;
    }

    // 3. Normalization and Namespace
    const norm = extractSemanticInput({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      canonicalModel: params.canonicalModel,
      policyVersion: params.policyVersion,
      request: params.request,
    });

    // 4. Max size check
    const serializedPayload = JSON.stringify(params.response);
    const sizeBytes = Buffer.byteLength(serializedPayload, "utf8");
    if (sizeBytes > this.policy.maxEntrySizeBytes) {
      return false;
    }

    // 5. Generate Embedding
    let embedding: readonly number[];
    try {
      embedding = await this.embeddingProvider.embed(norm.semanticText);
    } catch {
      return false;
    }

    const ttl = params.ttlSeconds ?? this.policy.ttlSeconds;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const responseHash = sha256(serializedPayload);

    const entry: SemanticCacheEntry = {
      id: generateId("scache"),
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      namespaceHash: norm.namespaceHash,
      requestFingerprint: `${params.organizationId}:${norm.semanticTextHash}`,
      semanticText: norm.semanticText,
      semanticTextHash: norm.semanticTextHash,
      embedding,
      embeddingModel: this.embeddingProvider.modelName,
      embeddingDimensions: this.embeddingProvider.dimensions,
      canonicalModel: params.canonicalModel,
      systemPromptHash: norm.systemPromptHash,
      policyVersion: params.policyVersion ?? 1,
      cachePolicyVersion: 1,
      parametersHash: norm.parametersHash,
      responseFormatHash: norm.responseFormatHash,
      responsePayload: params.response,
      responseHash,
      createdAt: now,
      expiresAt,
      hitCount: 0,
      status: "active",
    };

    try {
      await this.vectorStore.save(entry);
      return true;
    } catch {
      return false;
    }
  }

  public async quarantine(entryId: string): Promise<boolean> {
    const entry = await this.vectorStore.get(entryId);
    if (!entry) return false;
    await this.vectorStore.update(entryId, { status: "quarantined" });
    return true;
  }

  public async invalidate(filter: SemanticInvalidationFilter): Promise<number> {
    return await this.vectorStore.invalidate(filter);
  }

  public async getStats(organizationId?: string): Promise<{ totalEntries: number }> {
    const totalEntries = await this.vectorStore.count(organizationId);
    return { totalEntries };
  }
}
