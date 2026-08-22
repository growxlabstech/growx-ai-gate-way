import { z } from "zod";

// ==========================================
// 1. Canonical & OpenAI-Compatible Embedding Schemas
// ==========================================

export const embeddingEncodingFormatSchema = z.enum(["float", "base64"]);
export type EmbeddingEncodingFormat = z.infer<
  typeof embeddingEncodingFormatSchema
>;

export const openAIEmbeddingInputSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1).max(2048),
  z.array(z.number().int()).min(1),
  z.array(z.array(z.number().int()).min(1)).min(1).max(2048),
]);
export type OpenAIEmbeddingInput = z.infer<typeof openAIEmbeddingInputSchema>;

export const openAIEmbeddingRequestSchema = z.object({
  model: z.string().min(1).max(200),
  input: openAIEmbeddingInputSchema,
  encoding_format: embeddingEncodingFormatSchema.optional().default("float"),
  dimensions: z.number().int().positive().max(65_536).optional(),
  user: z.string().max(256).optional(),
});
export type OpenAIEmbeddingRequest = z.input<
  typeof openAIEmbeddingRequestSchema
>;

export const openAIEmbeddingDataSchema = z.object({
  object: z.literal("embedding").default("embedding"),
  index: z.number().int().nonnegative(),
  embedding: z.union([z.array(z.number()), z.string()]),
});
export type OpenAIEmbeddingData = z.infer<typeof openAIEmbeddingDataSchema>;

export const openAIEmbeddingUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type OpenAIEmbeddingUsage = z.infer<typeof openAIEmbeddingUsageSchema>;

export const openAIEmbeddingResponseSchema = z.object({
  object: z.literal("list").default("list"),
  model: z.string(),
  data: z.array(openAIEmbeddingDataSchema),
  usage: openAIEmbeddingUsageSchema,
});
export type OpenAIEmbeddingResponse = z.infer<
  typeof openAIEmbeddingResponseSchema
>;

// ==========================================
// 2. Canonical Embedding Model Metadata
// ==========================================

export const embeddingModelMetadataSchema = z.object({
  defaultDimensions: z.number().int().positive(),
  supportedDimensions: z.array(z.number().int().positive()).optional(),
  minDimensions: z.number().int().positive().optional(),
  maxDimensions: z.number().int().positive().optional(),
  dimensionControl: z.boolean().default(false),
  encodingFormats: z.array(embeddingEncodingFormatSchema).default(["float"]),
  maxBatchItems: z.number().int().positive().default(2048),
  maxInputTokensPerItem: z.number().int().positive().default(8192),
  normalizedVector: z.boolean().default(true),
  distanceRecommendations: z
    .array(z.enum(["cosine", "dot", "euclidean"]))
    .default(["cosine"]),
  providerCompatibilityGroup: z.string().optional(),
});
export type EmbeddingModelMetadata = z.infer<
  typeof embeddingModelMetadataSchema
>;

// ==========================================
// 3. Batch Planning & Chunking
// ==========================================

export const embeddingBatchChunkSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  inputs: z.array(z.string()),
  tokenEstimate: z.number().int().nonnegative(),
});
export type EmbeddingBatchChunk = z.infer<typeof embeddingBatchChunkSchema>;

export const embeddingBatchPlanSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  totalTokensEstimated: z.number().int().nonnegative(),
  chunks: z.array(embeddingBatchChunkSchema),
  maxChunkSize: z.number().int().positive(),
});
export type EmbeddingBatchPlan = z.infer<typeof embeddingBatchPlanSchema>;

// ==========================================
// 4. Vector Space Compatibility
// ==========================================

export const embeddingCompatibilityTypeSchema = z.enum([
  "exact_vector_space",
  "same_canonical_revision",
  "incompatible",
]);
export type EmbeddingCompatibilityType = z.infer<
  typeof embeddingCompatibilityTypeSchema
>;

export const embeddingCompatibilityRecordSchema = z.object({
  canonicalModelId: z.string(),
  routeA: z.string(),
  routeB: z.string(),
  compatibilityType: embeddingCompatibilityTypeSchema,
  verifiedAt: z.coerce.date(),
  source: z.enum(["configured", "provider_contract", "verified_fixture"]),
});
export type EmbeddingCompatibilityRecord = z.infer<
  typeof embeddingCompatibilityRecordSchema
>;

// ==========================================
// 5. Normalized Provider Embedding Execution Context
// ==========================================

export const normalizedEmbeddingRequestSchema = z.object({
  requestId: z.string(),
  canonicalModelId: z.string(),
  providerModelId: z.string(),
  inputs: z.array(z.string()),
  dimensions: z.number().int().positive().optional(),
  encodingFormat: embeddingEncodingFormatSchema.default("float"),
  user: z.string().optional(),
  timeoutMs: z.number().int().positive().default(60_000),
});
export type NormalizedEmbeddingRequest = z.infer<
  typeof normalizedEmbeddingRequestSchema
>;

export const normalizedEmbeddingItemSchema = z.object({
  index: z.number().int().nonnegative(),
  embedding: z.array(z.number()),
  base64Embedding: z.string().optional(),
});
export type NormalizedEmbeddingItem = z.infer<
  typeof normalizedEmbeddingItemSchema
>;

export const normalizedEmbeddingResponseSchema = z.object({
  model: z.string(),
  embeddings: z.array(normalizedEmbeddingItemSchema),
  promptTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  dimensions: z.number().int().positive(),
  rawUsage: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedEmbeddingResponse = z.infer<
  typeof normalizedEmbeddingResponseSchema
>;
