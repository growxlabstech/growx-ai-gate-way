import { z } from "zod";

// ==========================================
// 1. Tool Names & Basic Types
// ==========================================

export const toolNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Tool name must contain only letters, numbers, underscores, and hyphens (1-64 chars)");

export const toolExecutionModeSchema = z.enum(["return_to_client", "platform_managed"]);
export type ToolExecutionMode = z.infer<typeof toolExecutionModeSchema>;

export const toolStatusSchema = z.enum(["active", "disabled", "archived"]);
export type ToolStatus = z.infer<typeof toolStatusSchema>;

export const toolVisibilitySchema = z.enum(["workspace", "organization", "internal"]);
export type ToolVisibility = z.infer<typeof toolVisibilitySchema>;

export const sideEffectClassSchema = z.enum(["read_only", "idempotent_write", "non_idempotent_write"]);
export type SideEffectClass = z.infer<typeof sideEffectClassSchema>;

// ==========================================
// 2. Canonical Tool Definition
// ==========================================

export const jsonSchemaObjectSchema = z.record(z.string(), z.unknown());

export const canonicalToolDefinitionSchema = z.object({
  name: toolNameSchema,
  description: z.string().max(4096).optional(),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: jsonSchemaObjectSchema.optional(),
  strict: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CanonicalToolDefinition = z.infer<typeof canonicalToolDefinitionSchema>;

// Backward-compatible alias
export const toolDefinitionContractSchema = canonicalToolDefinitionSchema;
export type ToolDefinitionContract = CanonicalToolDefinition;

// ==========================================
// 3. Canonical Tool Choice
// ==========================================

export const canonicalToolChoiceSchema = z.union([
  z.literal("auto"),
  z.literal("none"),
  z.literal("required"),
  z.object({
    mode: z.literal("tool"),
    name: toolNameSchema,
  }),
]);
export type CanonicalToolChoice = z.infer<typeof canonicalToolChoiceSchema>;

// ==========================================
// 4. Canonical Tool Call & Status
// ==========================================

export const toolCallStatusSchema = z.enum([
  "requested",
  "validated",
  "rejected",
  "awaiting_result",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
]);
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

export const canonicalToolCallSchema = z.object({
  id: z.string(), // "tcall_..."
  requestId: z.string(),
  providerCallId: z.string().optional(),
  name: toolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
  rawArguments: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  status: toolCallStatusSchema.default("requested"),
  argumentsHash: z.string().optional(),
});
export type CanonicalToolCall = z.infer<typeof canonicalToolCallSchema>;

// ==========================================
// 5. Tool Error & Result
// ==========================================

export const toolErrorSchema = z.object({
  code: z.string(),
  type: z.string(),
  message: z.string(),
  retryable: z.boolean().default(false),
});
export type ToolError = z.infer<typeof toolErrorSchema>;

export const toolResultStatusSchema = z.enum(["success", "error", "cancelled"]);
export type ToolResultStatus = z.infer<typeof toolResultStatusSchema>;

export const canonicalToolResultSchema = z.object({
  toolCallId: z.string(),
  status: toolResultStatusSchema,
  content: z.string().max(1_048_576), // 1MB max content
  structuredData: z.record(z.string(), z.unknown()).optional(),
  error: toolErrorSchema.optional(),
});
export type CanonicalToolResult = z.infer<typeof canonicalToolResultSchema>;

// ==========================================
// 6. Registered Tools & Versions (Registry)
// ==========================================

export const registeredToolSchema = z.object({
  id: z.string(), // "tool_..."
  organizationId: z.string().optional(),
  workspaceId: z.string().optional(),
  key: z.string().min(1).max(64),
  name: toolNameSchema,
  description: z.string().max(4096).optional(),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: jsonSchemaObjectSchema.optional(),
  executionMode: toolExecutionModeSchema.default("return_to_client"),
  status: toolStatusSchema.default("active"),
  visibility: toolVisibilitySchema.default("organization"),
  activeVersion: z.number().int().positive().default(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RegisteredTool = z.infer<typeof registeredToolSchema>;

export const registeredToolVersionSchema = z.object({
  id: z.string(), // "tver_..."
  toolId: z.string(),
  version: z.number().int().positive(),
  description: z.string().max(4096).optional(),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: jsonSchemaObjectSchema.optional(),
  executionMode: toolExecutionModeSchema,
  requiredCapabilities: z.array(z.string()).default([]),
  contentHash: z.string(),
  createdAt: z.coerce.date(),
});
export type RegisteredToolVersion = z.infer<typeof registeredToolVersionSchema>;

// ==========================================
// 7. Tool Execution & Continuation Context
// ==========================================

export const toolExecutionPolicySchema = z.object({
  sideEffectClass: sideEffectClassSchema.default("read_only"),
  maxAttempts: z.number().int().min(1).max(5).default(1),
  timeoutMs: z.number().int().min(100).max(60_000).default(10_000),
  approvalRequired: z.boolean().default(false),
});
export type ToolExecutionPolicy = z.infer<typeof toolExecutionPolicySchema>;

export const toolExecutionContextSchema = z.object({
  organizationId: z.string(),
  workspaceId: z.string().optional(),
  userId: z.string().optional(),
  apiKeyId: z.string().optional(),
  requestId: z.string(),
  toolCallId: z.string(),
  policyContext: z.record(z.string(), z.unknown()).optional(),
  authorizationContext: z.record(z.string(), z.unknown()).optional(),
});
export type ToolExecutionContext = z.infer<typeof toolExecutionContextSchema>;

export const toolContinuationStatusSchema = z.enum(["pending", "resumed", "expired", "failed"]);
export type ToolContinuationStatus = z.infer<typeof toolContinuationStatusSchema>;

export const toolContinuationSchema = z.object({
  id: z.string(), // "tcont_..."
  requestId: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().optional(),
  providerId: z.string(),
  routeId: z.string(),
  modelId: z.string(),
  promptVersionId: z.string().optional(),
  providerStateReference: z.string().optional(),
  status: toolContinuationStatusSchema.default("pending"),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});
export type ToolContinuation = z.infer<typeof toolContinuationSchema>;

export const toolExecutionRecordSchema = z.object({
  id: z.string(), // "texec_..."
  toolCallId: z.string(),
  organizationId: z.string(),
  status: z.enum(["executing", "succeeded", "failed", "cancelled"]),
  sideEffectClass: sideEffectClassSchema,
  idempotencyKey: z.string().optional(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  errorCode: z.string().optional(),
  resultHash: z.string().optional(),
  createdAt: z.coerce.date(),
});
export type ToolExecutionRecord = z.infer<typeof toolExecutionRecordSchema>;

// ==========================================
// 8. Tool Registry DTOs & Request Schemas
// ==========================================

export const createToolRequestSchema = z.object({
  key: z.string().min(1).max(64),
  name: toolNameSchema,
  description: z.string().max(4096).optional(),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: jsonSchemaObjectSchema.optional(),
  executionMode: toolExecutionModeSchema.default("return_to_client"),
  visibility: toolVisibilitySchema.default("organization"),
  requiredCapabilities: z.array(z.string()).default([]),
});
export type CreateToolRequest = z.infer<typeof createToolRequestSchema>;

export const createToolVersionRequestSchema = z.object({
  description: z.string().max(4096).optional(),
  inputSchema: jsonSchemaObjectSchema,
  outputSchema: jsonSchemaObjectSchema.optional(),
  executionMode: toolExecutionModeSchema.optional(),
  requiredCapabilities: z.array(z.string()).optional(),
});
export type CreateToolVersionRequest = z.infer<typeof createToolVersionRequestSchema>;

export const submitToolResultRequestSchema = z.object({
  toolCallId: z.string(),
  status: toolResultStatusSchema.default("success"),
  content: z.string().max(1_048_576),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  error: toolErrorSchema.optional(),
});
export type SubmitToolResultRequest = z.infer<typeof submitToolResultRequestSchema>;

export const toolBindingSnapshotSchema = z.object({
  requestId: z.string(),
  toolId: z.string().optional(),
  toolVersionId: z.string().optional(),
  inlineToolHash: z.string().optional(),
  name: toolNameSchema,
  inputSchemaHash: z.string(),
  outputSchemaHash: z.string().optional(),
  executionMode: toolExecutionModeSchema,
});
export type ToolBindingSnapshot = z.infer<typeof toolBindingSnapshotSchema>;
