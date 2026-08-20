import { z } from "zod";

// ==========================================
// 1. Response Format Types
// ==========================================

export const responseFormatTypeSchema = z.enum(["text", "json_object", "json_schema"]);
export type ResponseFormatType = z.infer<typeof responseFormatTypeSchema>;

export const canonicalResponseFormatSchema = z.object({
  type: responseFormatTypeSchema,
  name: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
  description: z.string().max(2048).optional(),
  strict: z.boolean().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  schemaId: z.string().optional(),
  schemaVersionId: z.string().optional(),
});
export type CanonicalResponseFormat = z.infer<typeof canonicalResponseFormatSchema>;

// ==========================================
// 2. Response Schema Registry
// ==========================================

export const responseSchemaStatusSchema = z.enum(["active", "disabled", "archived"]);
export type ResponseSchemaStatus = z.infer<typeof responseSchemaStatusSchema>;

export const responseSchemaVisibilitySchema = z.enum(["organization", "workspace", "internal"]);
export type ResponseSchemaVisibility = z.infer<typeof responseSchemaVisibilitySchema>;

export const responseSchemaSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().optional(),
  key: z.string().min(1).max(128).regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  status: responseSchemaStatusSchema.default("active"),
  visibility: responseSchemaVisibilitySchema.default("organization"),
  activeVersion: z.number().int().positive().default(1),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ResponseSchema = z.infer<typeof responseSchemaSchema>;

export const responseSchemaVersionSchema = z.object({
  id: z.string(),
  schemaId: z.string(),
  version: z.number().int().positive(),
  schema: z.record(z.string(), z.unknown()),
  schemaHash: z.string(),
  description: z.string().max(2048).optional(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
});
export type ResponseSchemaVersion = z.infer<typeof responseSchemaVersionSchema>;

// ==========================================
// 3. Schema Feature Profile
// ==========================================

export const schemaFeatureProfileSchema = z.object({
  depth: z.number().int().nonnegative(),
  propertyCount: z.number().int().nonnegative(),
  requiredCount: z.number().int().nonnegative(),
  usesEnums: z.boolean(),
  usesUnions: z.boolean(),
  usesPatterns: z.boolean(),
  usesAdditionalPropertiesFalse: z.boolean(),
  usesNestedArrays: z.boolean(),
  usesFormat: z.boolean(),
  usesConst: z.boolean(),
  arrayNestingDepth: z.number().int().nonnegative(),
  enumValueCount: z.number().int().nonnegative(),
  unionBranchCount: z.number().int().nonnegative(),
  patternLength: z.number().int().nonnegative(),
  schemaSizeBytes: z.number().int().nonnegative(),
  complexityBucket: z.enum(["simple", "moderate", "complex"]),
});
export type SchemaFeatureProfile = z.infer<typeof schemaFeatureProfileSchema>;

// ==========================================
// 4. Structured Output Status + Outcome
// ==========================================

export const structuredOutputStatusSchema = z.enum([
  "not_requested",
  "valid",
  "invalid_json",
  "schema_invalid",
  "refusal",
  "truncated",
  "provider_unsupported",
  "retry_exhausted",
]);
export type StructuredOutputStatus = z.infer<typeof structuredOutputStatusSchema>;

export const structuredOutputOutcomeSchema = z.object({
  status: structuredOutputStatusSchema,
  responseFormatType: responseFormatTypeSchema.optional(),
  strict: z.boolean().optional(),
  schemaHash: z.string().optional(),
  validationErrors: z.array(z.object({
    path: z.string(),
    code: z.string(),
    message: z.string(),
  })).optional(),
  retryCount: z.number().int().nonnegative().default(0),
  parsedSuccessfully: z.boolean().optional(),
});
export type StructuredOutputOutcome = z.infer<typeof structuredOutputOutcomeSchema>;

// ==========================================
// 5. Structured Output Model Capabilities
// ==========================================

export const structuredOutputCapabilitiesSchema = z.object({
  jsonMode: z.boolean().default(false),
  jsonSchema: z.boolean().default(false),
  strictJsonSchema: z.boolean().default(false),
  streamingStructuredOutput: z.boolean().default(false),
  schemaMaxDepth: z.number().int().positive().optional(),
  schemaMaxBytes: z.number().int().positive().optional(),
  unionSupport: z.boolean().default(false),
  additionalPropertiesControl: z.boolean().default(false),
});
export type StructuredOutputCapabilities = z.infer<typeof structuredOutputCapabilitiesSchema>;

// ==========================================
// 6. Schema Complexity Limits
// ==========================================

export const structuredOutputComplexityLimitsSchema = z.object({
  maxSchemaBytes: z.number().int().positive().default(65_536),
  maxDepth: z.number().int().positive().default(8),
  maxProperties: z.number().int().positive().default(64),
  maxRequiredCount: z.number().int().positive().default(64),
  maxEnumValues: z.number().int().positive().default(128),
  maxArrayNesting: z.number().int().positive().default(4),
  maxUnionBranches: z.number().int().positive().default(8),
  maxPatternLength: z.number().int().positive().default(256),
  maxOutputBytes: z.number().int().positive().default(1_048_576),
});
export type StructuredOutputComplexityLimits = z.infer<typeof structuredOutputComplexityLimitsSchema>;

// ==========================================
// 7. Structured Retry Policy
// ==========================================

export const structuredRetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(3).default(1),
  retryOnInvalidJson: z.boolean().default(true),
  retryOnSchemaMismatch: z.boolean().default(true),
  retryOnTruncation: z.boolean().default(false),
  allowFallbackRoute: z.boolean().default(true),
});
export type StructuredRetryPolicy = z.infer<typeof structuredRetryPolicySchema>;

// ==========================================
// 8. Provider Structured Output Translation
// ==========================================

export const providerResponseFormatSchema = z.object({
  type: z.string(),
  providerPayload: z.unknown(),
  translationLossless: z.boolean(),
  translationNotes: z.array(z.string()).optional(),
});
export type ProviderResponseFormat = z.infer<typeof providerResponseFormatSchema>;
