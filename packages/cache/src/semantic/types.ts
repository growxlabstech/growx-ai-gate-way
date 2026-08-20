import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";

export type SemanticMissReason =
  | "disabled"
  | "ineligible"
  | "exact_miss"
  | "no_candidates"
  | "below_threshold"
  | "expired"
  | "policy_mismatch"
  | "model_mismatch"
  | "parameter_mismatch"
  | "format_mismatch"
  | "quarantined"
  | "embedding_failure"
  | "timeout"
  | "shadow_mode"
  | "negation_mismatch"
  | "numeric_mismatch";

export type SemanticCacheEntryStatus =
  | "active"
  | "expired"
  | "invalidated"
  | "quarantined";

export interface SemanticCachePolicy {
  enabled: boolean;
  similarityThreshold: number; // e.g. 0.85
  ttlSeconds: number; // e.g. 86400 (24h)
  maxEntrySizeBytes: number; // e.g. 512KB
  shadowMode: boolean; // if true, records metrics but returns MISS
  allowedModels?: readonly string[] | undefined;
  maxTemperature: number; // e.g. 0.3
  lookupTimeoutMs: number; // e.g. 100ms
}

export const DEFAULT_SEMANTIC_CACHE_POLICY: SemanticCachePolicy = {
  enabled: true,
  similarityThreshold: 0.85,
  ttlSeconds: 86400,
  maxEntrySizeBytes: 512 * 1024,
  shadowMode: false,
  maxTemperature: 0.3,
  lookupTimeoutMs: 100,
};

export interface SemanticCacheEntry {
  id: string;
  organizationId: string;
  workspaceId: string;
  namespaceHash: string;
  requestFingerprint: string;
  semanticText: string;
  semanticTextHash: string;
  embedding: readonly number[];
  embeddingModel: string;
  embeddingDimensions: number;
  canonicalModel: string;
  modelCompatibilityGroup?: string | undefined;
  systemPromptHash: string;
  policyVersion: number;
  cachePolicyVersion: number;
  parametersHash: string;
  responseFormatHash?: string | undefined;
  responsePayload: OpenAIChatCompletionResponse;
  responseHash: string;
  createdAt: Date;
  expiresAt: Date;
  lastHitAt?: Date | undefined;
  hitCount: number;
  status: SemanticCacheEntryStatus;
}

export interface SemanticCacheLookupResult {
  status: "HIT" | "MISS" | "BYPASS";
  entry?: SemanticCacheEntry | undefined;
  similarity?: number | undefined;
  missReason?: SemanticMissReason | undefined;
  lookupDurationMs: number;
  isShadowHit?: boolean | undefined;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
  embedBatch(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
  dimensions: number;
  modelName: string;
}

export interface SemanticCandidateMatch {
  entry: SemanticCacheEntry;
  similarity: number;
}
