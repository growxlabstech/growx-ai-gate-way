import { z } from "zod";
import { canonicalCapabilitySchema, type CanonicalCapability } from "./ai.js";

// ============================================================================
// Enums
// ============================================================================

export const promptTypeSchema = z.enum([
  "system",
  "developer",
  "user_template",
  "classification",
  "extraction",
  "structured_generation",
  "internal",
]);
export type PromptType = z.infer<typeof promptTypeSchema>;

export const promptStatusSchema = z.enum(["draft", "active", "archived"]);
export type PromptStatus = z.infer<typeof promptStatusSchema>;

export const promptVisibilitySchema = z.enum([
  "workspace",
  "organization",
  "internal",
]);
export type PromptVisibility = z.infer<typeof promptVisibilitySchema>;

export const templateFormatSchema = z.enum([
  "mustache",
  "handlebars_safe",
  "template_literal",
]);
export type TemplateFormat = z.infer<typeof templateFormatSchema>;

export const promptVariableTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
]);
export type PromptVariableType = z.infer<typeof promptVariableTypeSchema>;

export const promptReleaseEnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type PromptReleaseEnvironment = z.infer<
  typeof promptReleaseEnvironmentSchema
>;

export const promptReleaseStatusSchema = z.enum([
  "active",
  "retired",
  "rolled_back",
]);
export type PromptReleaseStatus = z.infer<typeof promptReleaseStatusSchema>;

export const promptRoleSchema = z.enum([
  "system",
  "developer",
  "user",
  "assistant",
]);
export type PromptRole = z.infer<typeof promptRoleSchema>;

// ============================================================================
// Core Entities & DTOs
// ============================================================================

export const promptVariableDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_]+$/),
    type: promptVariableTypeSchema,
    required: z.boolean().default(true),
    description: z.string().max(512).optional(),
    defaultValue: z.unknown().optional(),
    maxLength: z.number().int().positive().max(100_000).optional(),
    enum: z.array(z.string()).max(100).optional(),
    sensitive: z.boolean().default(false), // Mark variables that must NEVER be logged or audited
  })
  .strict();
export type PromptVariableDefinition = z.infer<
  typeof promptVariableDefinitionSchema
>;

export const promptMessageTemplateSchema = z
  .object({
    role: promptRoleSchema,
    contentTemplate: z.string().min(1).max(200_000),
  })
  .strict();
export type PromptMessageTemplate = z.infer<typeof promptMessageTemplateSchema>;

export const promptDefinitionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().optional(),
  key: z
    .string()
    .min(2)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  type: promptTypeSchema.default("user_template"),
  status: promptStatusSchema.default("active"),
  visibility: promptVisibilitySchema.default("organization"),
  isProtected: z.boolean().default(false),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PromptDefinition = z.infer<typeof promptDefinitionSchema>;

export const promptVersionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  version: z.number().int().positive(),
  messages: z.array(promptMessageTemplateSchema).min(1).max(64),
  template: z.string().max(500_000).optional(),
  templateFormat: templateFormatSchema.default("mustache"),
  variableSchema: z.array(promptVariableDefinitionSchema).max(100),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  contentHash: z.string(),
  requiredCapabilities: z.array(canonicalCapabilitySchema).default([]),
  preferredModelFamily: z.string().max(64).optional(),
  allowedModels: z.array(z.string()).max(100).default([]),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
});
export type PromptVersion = z.infer<typeof promptVersionSchema>;

export const promptReleaseSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  promptVersionId: z.string(),
  environment: promptReleaseEnvironmentSchema,
  status: promptReleaseStatusSchema,
  releaseNumber: z.number().int().positive(),
  releasedBy: z.string(),
  releasedAt: z.coerce.date(),
  rollbackFromReleaseId: z.string().optional(),
  notes: z.string().max(1024).optional(),
});
export type PromptRelease = z.infer<typeof promptReleaseSchema>;

export const promptReleaseHeadSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  environment: promptReleaseEnvironmentSchema,
  activeReleaseId: z.string(),
  activeVersionId: z.string(),
  updatedAt: z.coerce.date(),
});
export type PromptReleaseHead = z.infer<typeof promptReleaseHeadSchema>;

export const promptExecutionReferenceSchema = z.object({
  requestId: z.string(),
  promptId: z.string(),
  promptVersionId: z.string(),
  promptReleaseId: z.string().optional(),
  contentHash: z.string(),
  renderedHash: z.string(),
});
export type PromptExecutionReference = z.infer<
  typeof promptExecutionReferenceSchema
>;

// ============================================================================
// Request & Response DTOs
// ============================================================================

export const createPromptRequestSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .max(128)
      .regex(/^[a-zA-Z0-9._-]+$/),
    name: z.string().min(1).max(128),
    description: z.string().max(2000).optional(),
    type: promptTypeSchema.default("user_template"),
    visibility: promptVisibilitySchema.default("organization"),
    workspaceId: z.string().optional(),
    isProtected: z.boolean().default(false),
    // Optional initial version payload
    initialVersion: z
      .object({
        messages: z
          .array(promptMessageTemplateSchema)
          .min(1)
          .max(64)
          .optional(),
        template: z.string().min(1).max(200_000).optional(),
        templateFormat: templateFormatSchema.default("mustache"),
        variableSchema: z.array(promptVariableDefinitionSchema).default([]),
        outputSchema: z.record(z.string(), z.unknown()).optional(),
        requiredCapabilities: z.array(canonicalCapabilitySchema).optional(),
        preferredModelFamily: z.string().optional(),
        allowedModels: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .strict();
export type CreatePromptRequest = z.input<typeof createPromptRequestSchema>;

export const updatePromptRequestSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(2000).optional(),
    status: promptStatusSchema.optional(),
    visibility: promptVisibilitySchema.optional(),
    isProtected: z.boolean().optional(),
  })
  .strict();
export type UpdatePromptRequest = z.input<typeof updatePromptRequestSchema>;

export const createPromptVersionRequestSchema = z
  .object({
    messages: z.array(promptMessageTemplateSchema).min(1).max(64).optional(),
    template: z.string().min(1).max(200_000).optional(),
    templateFormat: templateFormatSchema.default("mustache"),
    variableSchema: z.array(promptVariableDefinitionSchema).default([]),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    requiredCapabilities: z.array(canonicalCapabilitySchema).optional(),
    preferredModelFamily: z.string().optional(),
    allowedModels: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreatePromptVersionRequest = z.input<
  typeof createPromptVersionRequestSchema
>;

export const createPromptReleaseRequestSchema = z
  .object({
    promptVersionId: z.string().min(1),
    environment: promptReleaseEnvironmentSchema.default("production"),
    notes: z.string().max(1024).optional(),
  })
  .strict();
export type CreatePromptReleaseRequest = z.input<
  typeof createPromptReleaseRequestSchema
>;

export const rollbackPromptReleaseRequestSchema = z
  .object({
    environment: promptReleaseEnvironmentSchema.default("production"),
    targetVersionId: z.string().optional(), // If omitted, rolls back to the previous active release
    reason: z.string().max(500).optional(),
  })
  .strict();
export type RollbackPromptReleaseRequest = z.input<
  typeof rollbackPromptReleaseRequestSchema
>;

export const renderPromptRequestSchema = z
  .object({
    promptId: z.string().optional(),
    promptKey: z.string().optional(),
    version: z.number().int().positive().optional(),
    environment: promptReleaseEnvironmentSchema.optional(),
    variables: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type RenderPromptRequest = z.input<typeof renderPromptRequestSchema>;

export const validatePromptRequestSchema = z
  .object({
    messages: z.array(promptMessageTemplateSchema).min(1).max(64).optional(),
    template: z.string().min(1).max(200_000).optional(),
    templateFormat: templateFormatSchema.default("mustache"),
    variableSchema: z.array(promptVariableDefinitionSchema).default([]),
    testVariables: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type ValidatePromptRequest = z.input<typeof validatePromptRequestSchema>;

// Gateway Prompt Execution Binding in Chat Completion
export const promptExecutionBindingSchema = z
  .object({
    key: z.string().min(1),
    version: z.number().int().positive().optional(),
    environment: promptReleaseEnvironmentSchema.optional(),
    variables: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type PromptExecutionBinding = z.infer<
  typeof promptExecutionBindingSchema
>;
