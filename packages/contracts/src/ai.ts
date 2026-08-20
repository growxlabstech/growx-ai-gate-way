import { z } from "zod";
import { promptExecutionBindingSchema } from "./prompt-registry.js";

export const canonicalModelStatusSchema = z.enum(["draft", "active", "deprecated", "disabled", "retired"]);
export type CanonicalModelStatus = z.infer<typeof canonicalModelStatusSchema>;

export const modelCategorySchema = z.enum([
  "chat",
  "responses",
  "embeddings",
  "image",
  "audio",
  "speech",
  "transcription",
  "video",
  "rerank",
]);
export type ModelCategory = z.infer<typeof modelCategorySchema>;

export const canonicalCapabilitySchema = z.enum([
  "text.generate",
  "text.reason",
  "tools.call",
  "structured_output",
  "vision.input",
  "image.generate",
  "audio.input",
  "audio.output",
  "speech.generate",
  "transcription",
  "embeddings.create",
  "video.input",
  "video.output",
  "batch",
  "streaming",
]);
export type CanonicalCapability = z.infer<typeof canonicalCapabilitySchema>;

// Legacy capability enum preserved for backward compatibility
export const modelCapabilitySchema = z.enum([
  "text",
  "vision",
  "audioInput",
  "audioOutput",
  "embeddings",
  "tools",
  "structuredOutput",
  "reasoning",
  "streaming",
  "batch",
  "imageGeneration",
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const inputModalitySchema = z.enum(["text", "image", "audio", "video", "file"]);
export type InputModality = z.infer<typeof inputModalitySchema>;

export const outputModalitySchema = z.enum(["text", "image", "audio", "embeddings", "video"]);
export type OutputModality = z.infer<typeof outputModalitySchema>;

export const providerRouteStatusSchema = z.enum(["active", "degraded", "disabled", "deprecated", "retired"]);
export type ProviderRouteStatus = z.infer<typeof providerRouteStatusSchema>;

export const aliasStatusSchema = z.enum(["active", "deprecated", "retired"]);
export type AliasStatus = z.infer<typeof aliasStatusSchema>;

export const aliasTypeSchema = z.enum(["static", "version", "product"]);
export type AliasType = z.infer<typeof aliasTypeSchema>;

export const pricingTypeSchema = z.enum(["standard", "tiered"]);
export type PricingType = z.infer<typeof pricingTypeSchema>;

export const pricingSourceSchema = z.enum(["manual", "provider_sync", "system"]);
export type PricingSource = z.infer<typeof pricingSourceSchema>;

// Canonical Model Domain Record
export const canonicalModelSchema = z.object({
  id: z.string(),
  canonicalId: z.string().min(3).max(128).regex(/^[a-z0-9_-]+\/[A-Za-z0-9._:-]+$/),
  displayName: z.string().min(1).max(100),
  family: z.string().min(1).max(64),
  category: modelCategorySchema.default("chat"),
  status: canonicalModelStatusSchema.default("active"),
  customerVisible: z.boolean().default(true),
  routingEligible: z.boolean().default(true),
  description: z.string().max(2000).default(""),
  contextWindow: z.number().int().positive(),
  maxInputTokens: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().positive(),
  supportsStreaming: z.boolean().default(true),
  supportsTools: z.boolean().default(false),
  supportsStructuredOutput: z.boolean().default(false),
  supportsReasoning: z.boolean().default(false),
  inputModalities: z.array(inputModalitySchema).default(["text"]),
  outputModalities: z.array(outputModalitySchema).default(["text"]),
  capabilities: z.array(canonicalCapabilitySchema).default(["text.generate", "streaming"]),
  reasoningMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  toolMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  structuredOutputMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  deprecatedAt: z.coerce.date().nullable().optional(),
  sunsetAt: z.coerce.date().nullable().optional(),
  replacementModelId: z.string().nullable().optional(),
  deprecationMessage: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type CanonicalModel = z.infer<typeof canonicalModelSchema>;

// Customer-safe Model Catalog Item
export const modelCatalogItemSchema = z.object({
  id: z.string(),
  canonicalId: z.string(),
  displayName: z.string(),
  family: z.string(),
  category: modelCategorySchema,
  status: canonicalModelStatusSchema,
  description: z.string(),
  contextWindow: z.number().int(),
  maxInputTokens: z.number().int().nullable().optional(),
  maxOutputTokens: z.number().int(),
  supportsStreaming: z.boolean(),
  supportsTools: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  supportsReasoning: z.boolean(),
  inputModalities: z.array(inputModalitySchema),
  outputModalities: z.array(outputModalitySchema),
  capabilities: z.array(canonicalCapabilitySchema),
  deprecatedAt: z.string().nullable().optional(),
  sunsetAt: z.string().nullable().optional(),
  replacementModelId: z.string().nullable().optional(),
  deprecationMessage: z.string().nullable().optional(),
});
export type ModelCatalogItem = z.infer<typeof modelCatalogItemSchema>;

// OpenAI-compatible Model Item
export const openAIModelItemSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number().int(),
  owned_by: z.string(),
});
export type OpenAIModelItem = z.infer<typeof openAIModelItemSchema>;

export const openAIModelListResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(openAIModelItemSchema),
});
export type OpenAIModelListResponse = z.infer<typeof openAIModelListResponseSchema>;

// Provider Route Record
export const providerRouteSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  canonicalModelId: z.string(),
  providerId: z.string(),
  providerModelId: z.string(),
  region: z.string().default("global"),
  status: providerRouteStatusSchema.default("active"),
  routingEligible: z.boolean().default(true),
  priority: z.number().int().default(100),
  contextWindowOverride: z.number().int().positive().nullable().optional(),
  maxOutputTokensOverride: z.number().int().positive().nullable().optional(),
  capabilitiesOverrides: z.array(canonicalCapabilitySchema).nullable().optional(),
  pricingReference: z.string().nullable().optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  deprecatedAt: z.coerce.date().nullable().optional(),
  retiredAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProviderRoute = z.infer<typeof providerRouteSchema>;

// Model Alias Record
export const modelAliasRecordSchema = z.object({
  id: z.string(),
  alias: z.string().min(1).max(128),
  canonicalModelId: z.string(),
  status: aliasStatusSchema.default("active"),
  type: aliasTypeSchema.default("static"),
  description: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  retiredAt: z.coerce.date().nullable().optional(),
});
export type ModelAliasRecord = z.infer<typeof modelAliasRecordSchema>;

// Model Pricing Record
export const modelPricingRecordSchema = z.object({
  id: z.string(),
  modelId: z.string().nullable().optional(),
  routeId: z.string().nullable().optional(),
  pricingType: pricingTypeSchema.default("standard"),
  inputPricePerMillionMinor: z.number().int().nonnegative(),
  outputPricePerMillionMinor: z.number().int().nonnegative(),
  cachedInputPricePerMillionMinor: z.number().int().nonnegative().nullable().optional(),
  reasoningPricePerMillionMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  source: pricingSourceSchema.default("manual"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
export type ModelPricingRecord = z.infer<typeof modelPricingRecordSchema>;

// Resolved Model Context (Returned by Resolver for Gateway Engine)
export const resolvedModelContextSchema = z.object({
  requestedModelId: z.string(),
  canonicalModelId: z.string(),
  aliasUsed: z
    .object({
      alias: z.string(),
      type: aliasTypeSchema,
    })
    .optional(),
  model: modelCatalogItemSchema,
  capabilities: z.array(canonicalCapabilitySchema),
  limits: z.object({
    contextWindow: z.number().int(),
    maxInputTokens: z.number().int().nullable().optional(),
    maxOutputTokens: z.number().int(),
  }),
  eligibleConfiguredRoutes: z.array(providerRouteSchema),
  isExecutable: z.boolean(),
  deprecation: z
    .object({
      deprecatedAt: z.string().nullable(),
      sunsetAt: z.string().nullable(),
      replacementModelId: z.string().nullable(),
      message: z.string().nullable(),
    })
    .optional(),
});
export type ResolvedModelContext = z.infer<typeof resolvedModelContextSchema>;

// Admin Privileged Model Request DTOs
export const createCanonicalModelRequestSchema = z.object({
  canonicalId: z.string().min(3).max(128).regex(/^[a-z0-9_-]+\/[A-Za-z0-9._:-]+$/),
  displayName: z.string().min(1).max(100),
  family: z.string().min(1).max(64),
  category: modelCategorySchema.default("chat"),
  status: canonicalModelStatusSchema.default("active"),
  customerVisible: z.boolean().default(true),
  routingEligible: z.boolean().default(true),
  description: z.string().max(2000).optional(),
  contextWindow: z.number().int().positive(),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive(),
  supportsStreaming: z.boolean().default(true),
  supportsTools: z.boolean().default(false),
  supportsStructuredOutput: z.boolean().default(false),
  supportsReasoning: z.boolean().default(false),
  inputModalities: z.array(inputModalitySchema).default(["text"]),
  outputModalities: z.array(outputModalitySchema).default(["text"]),
  capabilities: z.array(canonicalCapabilitySchema).default(["text.generate", "streaming"]),
  reasoningMetadata: z.record(z.string(), z.unknown()).optional(),
  toolMetadata: z.record(z.string(), z.unknown()).optional(),
  structuredOutputMetadata: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateCanonicalModelRequest = z.input<typeof createCanonicalModelRequestSchema>;

export const updateCanonicalModelRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  family: z.string().min(1).max(64).optional(),
  category: modelCategorySchema.optional(),
  customerVisible: z.boolean().optional(),
  routingEligible: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxInputTokens: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  supportsStructuredOutput: z.boolean().optional(),
  supportsReasoning: z.boolean().optional(),
  inputModalities: z.array(inputModalitySchema).optional(),
  outputModalities: z.array(outputModalitySchema).optional(),
  capabilities: z.array(canonicalCapabilitySchema).optional(),
  reasoningMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  toolMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  structuredOutputMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type UpdateCanonicalModelRequest = z.input<typeof updateCanonicalModelRequestSchema>;

export const deprecateModelRequestSchema = z.object({
  sunsetAt: z.union([z.string(), z.date()]).optional(),
  replacementModelId: z.string().optional(),
  message: z.string().max(1000).optional(),
}).strict();
export type DeprecateModelRequest = z.input<typeof deprecateModelRequestSchema>;

export const createProviderRouteRequestSchema = z.object({
  modelId: z.string(),
  providerId: z.string(),
  providerModelId: z.string().min(1).max(128),
  region: z.string().min(1).max(64).default("global"),
  status: providerRouteStatusSchema.default("active"),
  routingEligible: z.boolean().default(true),
  priority: z.number().int().default(100),
  contextWindowOverride: z.number().int().positive().optional(),
  maxOutputTokensOverride: z.number().int().positive().optional(),
  capabilitiesOverrides: z.array(canonicalCapabilitySchema).optional(),
  pricingReference: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateProviderRouteRequest = z.input<typeof createProviderRouteRequestSchema>;

export const updateProviderRouteRequestSchema = z.object({
  providerModelId: z.string().min(1).max(128).optional(),
  region: z.string().min(1).max(64).optional(),
  status: providerRouteStatusSchema.optional(),
  routingEligible: z.boolean().optional(),
  priority: z.number().int().optional(),
  contextWindowOverride: z.number().int().positive().nullable().optional(),
  maxOutputTokensOverride: z.number().int().positive().nullable().optional(),
  capabilitiesOverrides: z.array(canonicalCapabilitySchema).nullable().optional(),
  pricingReference: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type UpdateProviderRouteRequest = z.input<typeof updateProviderRouteRequestSchema>;

export const createModelAliasRequestSchema = z.object({
  alias: z.string().min(1).max(128),
  canonicalModelId: z.string(),
  type: aliasTypeSchema.default("static"),
  description: z.string().max(500).optional(),
}).strict();
export type CreateModelAliasRequest = z.input<typeof createModelAliasRequestSchema>;

export const updateModelAliasRequestSchema = z.object({
  canonicalModelId: z.string().optional(),
  status: aliasStatusSchema.optional(),
  type: aliasTypeSchema.optional(),
  description: z.string().max(500).nullable().optional(),
}).strict();
export type UpdateModelAliasRequest = z.input<typeof updateModelAliasRequestSchema>;

export const createModelPricingRequestSchema = z.object({
  modelId: z.string().optional(),
  routeId: z.string().optional(),
  pricingType: pricingTypeSchema.default("standard"),
  inputPricePerMillionMinor: z.number().int().nonnegative(),
  outputPricePerMillionMinor: z.number().int().nonnegative(),
  cachedInputPricePerMillionMinor: z.number().int().nonnegative().optional(),
  reasoningPricePerMillionMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default("USD"),
  effectiveFrom: z.union([z.string(), z.date()]).optional(),
  effectiveTo: z.union([z.string(), z.date()]).optional(),
  source: pricingSourceSchema.default("manual"),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateModelPricingRequest = z.input<typeof createModelPricingRequestSchema>;


// Gateway Execution Interfaces
export const messageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().min(1).max(200_000),
    toolCallId: z.string().max(128).optional(),
  })
  .strict();

export const functionToolSchema = z
  .object({
    type: z.literal("function"),
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    description: z.string().max(1024).optional(),
    parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const generationSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(131_072).optional(),
    topP: z.number().min(0).max(1).optional(),
    stop: z.array(z.string().max(256)).max(8).optional(),
    seed: z.number().int().optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
  })
  .strict();

export const modelRequestSchema = z
  .object({
    requestId: z.string(),
    organizationId: z.string(),
    workspaceId: z.string(),
    environmentId: z.string(),
    apiKeyId: z.string(),
    model: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/).max(200),
    input: z.union([z.string().min(1).max(500_000), z.array(messageSchema).min(1).max(256)]),
    instructions: z.string().max(100_000).optional(),
    stream: z.boolean().default(false),
    generation: generationSchema.default({}),
    tools: z.array(functionToolSchema).max(64).optional(),
    toolChoice: z.union([z.literal("auto"), z.literal("none"), z.string().max(64)]).optional(),
    responseFormat: z
      .object({
        type: z.enum(["text", "json_object", "json_schema"]),
        schema: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
    reasoning: z.object({ effort: z.enum(["low", "medium", "high"]).optional() }).strict().optional(),
    metadata: z
      .record(z.string().max(64), z.string().max(512))
      .refine((value) => Object.keys(value).length <= 32, "Too many metadata fields")
      .optional(),
  })
  .strict();
export type GrowXModelRequest = z.infer<typeof modelRequestSchema>;

export const embeddingRequestSchema = z
  .object({
    requestId: z.string(),
    organizationId: z.string(),
    workspaceId: z.string(),
    environmentId: z.string(),
    apiKeyId: z.string(),
    model: z.string().max(200),
    input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(2048)]),
    encodingFormat: z.enum(["float", "base64"]).default("float"),
    dimensions: z.number().int().positive().max(65_536).optional(),
  })
  .strict();
export type GrowXEmbeddingRequest = z.infer<typeof embeddingRequestSchema>;

export interface GrowXUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface GrowXOutput {
  type: "message" | "tool_call";
  role?: "assistant";
  content?: string;
  toolCall?: { id: string; name: string; arguments: string };
}

export interface GrowXModelResponse {
  id: string;
  model: string;
  provider: string;
  output: GrowXOutput[];
  finishReason?: string;
  usage: GrowXUsage;
  timing: { startedAt: string; completedAt: string; latencyMs: number; timeToFirstTokenMs?: number };
}

export interface GrowXEmbeddingResponse {
  id: string;
  model: string;
  provider: string;
  vectors: Array<{ index: number; embedding: number[] | string }>;
  usage: GrowXUsage;
}

export type StreamEventType =
  | "response.created"
  | "output_text.delta"
  | "tool_call.created"
  | "tool_call.delta"
  | "tool_call.completed"
  | "usage.update"
  | "response.completed"
  | "response.failed";

export interface GrowXStreamEvent {
  requestId: string;
  responseId: string;
  sequence: number;
  type: StreamEventType;
  timestamp: string;
  delta?: string | undefined;
  usage?: GrowXUsage | undefined;
  response?: GrowXModelResponse | undefined;
  error?: { code: string; message: string } | undefined;
}

export type ProviderErrorCode =
  | "provider_authentication_error"
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_invalid_request"
  | "provider_content_policy"
  | "provider_server_error"
  | "model_not_found"
  | "model_not_allowed"
  | "model_disabled"
  | "model_retired"
  | "model_not_executable"
  | "model_unavailable"
  | "model_capability_not_supported"
  | "gateway_timeout"
  | "request_cancelled"
  | "rate_limit_exceeded"
  | "token_rate_limit_exceeded"
  | "concurrency_limit_exceeded"
  | "provider_capacity_exhausted"
  | "global_overload"
  | "policy_denied"
  | "prompt_not_found"
  | "prompt_not_released"
  | "prompt_render_error";

export class GrowXProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "GrowXProviderError";
  }
}

// -------------------------------------------------------------
// Phase 5 — Provider Domain & Normalized Adapter Contracts
// -------------------------------------------------------------

export const providerStatusSchema = z.enum([
  "active",
  "disabled",
  "maintenance",
  "deprecated",
  "retired",
  "degraded",
]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const providerCredentialStatusSchema = z.enum([
  "active",
  "disabled",
  "rotating",
  "revoked",
]);
export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>;

export const finishReasonSchema = z.enum([
  "stop",
  "length",
  "tool_call",
  "content_filter",
  "error",
  "cancelled",
  "other",
]);
export type FinishReason = z.infer<typeof finishReasonSchema>;

export const usageSourceSchema = z.enum([
  "provider_reported",
  "estimated",
  "unavailable",
]);
export type UsageSource = z.infer<typeof usageSourceSchema>;

// Multimodal Content Parts
export const textContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export const imageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  imageUrl: z.object({
    url: z.string(),
    detail: z.enum(["auto", "low", "high"]).optional(),
  }),
});
export const audioContentPartSchema = z.object({
  type: z.literal("audio"),
  audio: z.object({
    data: z.string(),
    format: z.string(),
  }),
});
export const fileContentPartSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    fileId: z.string(),
    mimeType: z.string().optional(),
  }),
});
export const contentPartSchema = z.discriminatedUnion("type", [
  textContentPartSchema,
  imageUrlContentPartSchema,
  audioContentPartSchema,
  fileContentPartSchema,
]);
export type ContentPart = z.infer<typeof contentPartSchema>;

// Tool Call & Tool Definition
export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.union([z.string(), z.record(z.string(), z.unknown())]),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const toolDefinitionSchema = z.object({
  type: z.literal("function").default("function"),
  name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  description: z.string().max(1024).optional(),
  parameters: z.record(z.string(), z.unknown()),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

// Normalized Message
export const normalizedMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(contentPartSchema)]),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
});
export type NormalizedMessage = z.infer<typeof normalizedMessageSchema>;

// Structured Output & Reasoning
export const structuredOutputRequestSchema = z.object({
  type: z.enum(["json_object", "json_schema"]),
  name: z.string().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().optional(),
});
export type StructuredOutputRequest = z.infer<typeof structuredOutputRequestSchema>;

export const reasoningConfigSchema = z.object({
  effort: z.enum(["low", "medium", "high"]).optional(),
  maxTokens: z.number().int().positive().optional(),
});
export type ReasoningConfig = z.infer<typeof reasoningConfigSchema>;

// Normalized Generation Request
export const normalizedGenerationRequestSchema = z.object({
  requestId: z.string(),
  canonicalModelId: z.string(),
  providerModelId: z.string(),
  messages: z.array(normalizedMessageSchema),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  stop: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolDefinitionSchema).optional(),
  toolChoice: z.union([
    z.literal("auto"),
    z.literal("none"),
    z.literal("required"),
    z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) }),
  ]).optional(),
  structuredOutput: structuredOutputRequestSchema.optional(),
  reasoning: reasoningConfigSchema.optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type NormalizedGenerationRequest = z.infer<typeof normalizedGenerationRequestSchema>;

// Provider Usage & Normalized Generation Response
export const providerUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  audioTokens: z.number().int().nonnegative().optional(),
  imageUnits: z.number().int().nonnegative().optional(),
  source: usageSourceSchema.default("provider_reported"),
});
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export const normalizedGenerationResponseSchema = z.object({
  requestId: z.string(),
  canonicalModelId: z.string(),
  providerId: z.string(),
  providerModelId: z.string(),
  providerRequestId: z.string().optional(),
  output: z.array(normalizedMessageSchema),
  finishReason: finishReasonSchema,
  toolCalls: z.array(toolCallSchema).optional(),
  structuredOutput: z.unknown().optional(),
  usage: providerUsageSchema,
  timing: z.object({
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date(),
    latencyMs: z.number().int().nonnegative(),
    timeToFirstTokenMs: z.number().int().nonnegative().optional(),
  }),
  rawProviderMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedGenerationResponse = z.infer<typeof normalizedGenerationResponseSchema>;

// Normalized Stream Events
export const normalizedStreamEventTypeSchema = z.enum([
  "response.started",
  "output_text.delta",
  "output_text.done",
  "tool_call.started",
  "tool_call.delta",
  "tool_call.done",
  "usage",
  "response.completed",
  "error",
]);
export type NormalizedStreamEventType = z.infer<typeof normalizedStreamEventTypeSchema>;

export const normalizedStreamEventSchema = z.object({
  requestId: z.string(),
  responseId: z.string(),
  sequence: z.number().int().nonnegative(),
  type: normalizedStreamEventTypeSchema,
  timestamp: z.string(),
  delta: z.string().optional(),
  toolCall: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    index: z.number().int().optional(),
    argumentsDelta: z.string().optional(),
  }).optional(),
  usage: providerUsageSchema.optional(),
  finishReason: finishReasonSchema.optional(),
  response: normalizedGenerationResponseSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().optional(),
  }).optional(),
});
export type NormalizedStreamEvent = z.infer<typeof normalizedStreamEventSchema>;

// Provider Execution Context
export const providerExecutionContextSchema = z.object({
  requestId: z.string(),
  providerId: z.string(),
  providerRouteId: z.string(),
  credentialId: z.string(),
  canonicalModelId: z.string(),
  providerModelId: z.string(),
  organizationId: z.string().optional(),
  workspaceId: z.string().optional(),
  apiKeyId: z.string().optional(),
  timeoutMs: z.number().int().positive(),
  traceContext: z.record(z.string(), z.unknown()).optional(),
  decryptedCredential: z.string().optional(),
});
export type ProviderExecutionContext = z.infer<typeof providerExecutionContextSchema> & {
  cancellationSignal?: AbortSignal;
};

// Normalized Provider Error Detail
export interface NormalizedProviderError {
  code: ProviderErrorCode;
  providerId: string;
  providerStatus?: number | undefined;
  retryable: boolean;
  category: string;
  safeMessage: string;
  providerRequestId?: string | undefined;
  internalCause?: unknown;
}

// Provider and Credential Admin DTOs
export const createProviderRequestSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  displayName: z.string().min(1).max(100),
  adapterType: z.string().min(1).max(64),
  baseUrl: z.string().url(),
  apiVersion: z.string().max(32).optional(),
  region: z.string().max(64).default("global"),
  priority: z.number().int().default(100),
  enabled: z.boolean().default(true),
  status: providerStatusSchema.default("active"),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateProviderRequest = z.input<typeof createProviderRequestSchema>;

export const updateProviderRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  adapterType: z.string().min(1).max(64).optional(),
  baseUrl: z.string().url().optional(),
  apiVersion: z.string().max(32).nullable().optional(),
  region: z.string().max(64).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  status: providerStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type UpdateProviderRequest = z.input<typeof updateProviderRequestSchema>;

export const createProviderCredentialRequestSchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.string().min(1).max(64).default("production"),
  rawSecret: z.string().min(1).max(8192),
  encryptionKeyVersion: z.string().default("v1"),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateProviderCredentialRequest = z.input<typeof createProviderCredentialRequestSchema>;

export const rotateProviderCredentialRequestSchema = z.object({
  newRawSecret: z.string().min(1).max(8192),
  encryptionKeyVersion: z.string().default("v1"),
  reason: z.string().max(500).optional(),
}).strict();
export type RotateProviderCredentialRequest = z.input<typeof rotateProviderCredentialRequestSchema>;

export const providerCredentialMetadataSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  environment: z.string(),
  encryptionKeyVersion: z.string(),
  status: providerCredentialStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  rotatedAt: z.coerce.date().nullable().optional(),
  disabledAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()),
});
export type ProviderCredentialMetadata = z.infer<typeof providerCredentialMetadataSchema>;

export const providerRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  displayName: z.string(),
  adapterType: z.string(),
  baseUrl: z.string(),
  apiVersion: z.string().nullable().optional(),
  region: z.string(),
  priority: z.number().int(),
  enabled: z.boolean(),
  status: providerStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()),
});
export type ProviderRecord = z.infer<typeof providerRecordSchema>;

// -------------------------------------------------------------
// Phase 6 — OpenAI-Compatible Gateway Contracts
// -------------------------------------------------------------

export const openAIChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(contentPartSchema)]).nullable().optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(
    z.object({
      id: z.string(),
      type: z.literal("function").default("function"),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })
  ).optional(),
});
export type OpenAIChatMessage = z.infer<typeof openAIChatMessageSchema>;

export const openAIResponseFormatSchema = z.object({
  type: z.enum(["text", "json_object", "json_schema"]).default("text"),
  json_schema: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
  }).optional(),
});
export type OpenAIResponseFormat = z.infer<typeof openAIResponseFormatSchema>;

export const openAIChatCompletionRequestSchema = z.object({
  model: z.string().default("gpt-4o"),
  messages: z.array(openAIChatMessageSchema).default([]),
  prompt: promptExecutionBindingSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(toolDefinitionSchema).optional(),
  tool_choice: z.union([
    z.literal("auto"),
    z.literal("none"),
    z.literal("required"),
    z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) }),
  ]).optional(),
  response_format: openAIResponseFormatSchema.optional(),
  reasoning_effort: z.enum(["low", "medium", "high"]).optional(),
  stream_options: z.object({
    include_usage: z.boolean().optional(),
  }).optional(),
  user: z.string().max(256).optional(),
}).refine(
  (data) => (data.messages && data.messages.length > 0) || !!data.prompt,
  {
    message: "Either 'messages' with at least one message or 'prompt' must be provided",
    path: ["messages"],
  }
);
export type OpenAIChatCompletionRequest = z.infer<typeof openAIChatCompletionRequestSchema>;

export const openAIChatCompletionChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  message: openAIChatMessageSchema,
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter"]).nullable(),
  logprobs: z.null().optional(),
});
export type OpenAIChatCompletionChoice = z.infer<typeof openAIChatCompletionChoiceSchema>;

export const openAIChatCompletionUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});
export type OpenAIChatCompletionUsage = z.infer<typeof openAIChatCompletionUsageSchema>;

export const openAIChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion").default("chat.completion"),
  created: z.number().int().nonnegative(),
  model: z.string(),
  choices: z.array(openAIChatCompletionChoiceSchema),
  usage: openAIChatCompletionUsageSchema,
  system_fingerprint: z.string().optional(),
});
export type OpenAIChatCompletionResponse = z.infer<typeof openAIChatCompletionResponseSchema>;

export const openAIChatCompletionChunkDeltaSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]).optional(),
  content: z.string().nullable().optional(),
  tool_calls: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      id: z.string().optional(),
      type: z.literal("function").optional(),
      function: z.object({
        name: z.string().optional(),
        arguments: z.string().optional(),
      }).optional(),
    })
  ).optional(),
});
export type OpenAIChatCompletionChunkDelta = z.infer<typeof openAIChatCompletionChunkDeltaSchema>;

export const openAIChatCompletionChunkChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  delta: openAIChatCompletionChunkDeltaSchema,
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter"]).nullable().optional(),
  logprobs: z.null().optional(),
});
export type OpenAIChatCompletionChunkChoice = z.infer<typeof openAIChatCompletionChunkChoiceSchema>;

export const openAIChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk").default("chat.completion.chunk"),
  created: z.number().int().nonnegative(),
  model: z.string(),
  choices: z.array(openAIChatCompletionChunkChoiceSchema),
  usage: openAIChatCompletionUsageSchema.optional(),
  system_fingerprint: z.string().optional(),
});
export type OpenAIChatCompletionChunk = z.infer<typeof openAIChatCompletionChunkSchema>;



