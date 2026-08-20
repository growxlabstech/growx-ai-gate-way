import { z } from "zod";

// ==========================================
// 1. Data Classification & Categories
// ==========================================

export const dataClassSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CUSTOMER_CONTENT",
  "CUSTOMER_METADATA",
  "PERSONAL_DATA",
  "SENSITIVE_CUSTOMER_DATA",
  "AUTH_SECRET",
  "PROVIDER_SECRET",
  "FINANCIAL_RECORD",
  "AUDIT_RECORD",
  "SECURITY_RECORD",
]);
export type DataClass = z.infer<typeof dataClassSchema>;

export const dataCategorySchema = z.enum([
  "identity",
  "prompt",
  "model_output",
  "file",
  "image",
  "audio",
  "embedding",
  "tool_input",
  "tool_output",
  "batch_input",
  "batch_output",
  "provider_artifact",
  "usage",
  "analytics",
  "billing",
  "audit",
  "security",
  "notification",
  "webhook",
  "credential",
]);
export type DataCategory = z.infer<typeof dataCategorySchema>;

export const dataRegionSchema = z.enum(["IN", "EU", "US", "APAC", "GLOBAL"]);
export type DataRegion = z.infer<typeof dataRegionSchema>;

// ==========================================
// 2. Governed DataResource Entity (Metadata only!)
// ==========================================

export const dataResourceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  dataClass: dataClassSchema,
  dataCategory: dataCategorySchema,
  region: dataRegionSchema.default("GLOBAL"),
  retentionPolicyId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
});
export type DataResource = z.infer<typeof dataResourceSchema>;

// ==========================================
// 3. Retention Policies & Holds
// ==========================================

export const retentionScopeSchema = z.enum([
  "platform_default",
  "product",
  "organization",
  "workspace",
  "category",
  "resource",
]);
export type RetentionScope = z.infer<typeof retentionScopeSchema>;

export const retentionActionSchema = z.enum(["DELETE", "ANONYMIZE", "AGGREGATE", "RETAIN"]);
export type RetentionAction = z.infer<typeof retentionActionSchema>;

export const retentionPolicySchema = z.object({
  id: z.string().min(1),
  scope: retentionScopeSchema,
  scopeId: z.string().nullable().optional(), // organizationId, workspaceId, etc.
  category: dataCategorySchema.optional(),
  durationDays: z.number().int().nonnegative(), // 0 = zero retention
  action: retentionActionSchema.default("DELETE"),
  legalBasis: z.string().nullable().optional(),
  priority: z.number().int().default(100),
  version: z.number().int().positive().default(1),
  status: z.enum(["active", "archived", "disabled"]).default("active"),
  createdAt: z.coerce.date(),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

export const retentionHoldSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  workspaceId: z.string().nullable().optional(),
  scope: z.enum(["organization", "workspace", "category", "resource"]),
  category: dataCategorySchema.optional(),
  resourceId: z.string().optional(),
  reasonCode: z.string().min(1),
  description: z.string().optional(),
  createdBy: z.string().min(1),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  status: z.enum(["active", "released"]).default("active"),
});
export type RetentionHold = z.infer<typeof retentionHoldSchema>;

// ==========================================
// 4. Data Lineage
// ==========================================

export const lineageRelationshipSchema = z.enum([
  "DERIVED_FROM",
  "GENERATED_FROM",
  "EMBEDDED_FROM",
  "TRANSCRIBED_FROM",
  "EXTRACTED_FROM",
  "PROVIDER_COPY_OF",
]);
export type LineageRelationship = z.infer<typeof lineageRelationshipSchema>;

export const dataLineageSchema = z.object({
  id: z.string().min(1),
  sourceResourceId: z.string().min(1),
  derivedResourceId: z.string().min(1),
  relationship: lineageRelationshipSchema,
  createdAt: z.coerce.date(),
});
export type DataLineage = z.infer<typeof dataLineageSchema>;

// ==========================================
// 5. Provider Data Policy
// ==========================================

export const providerDataPolicySchema = z.object({
  providerId: z.string().min(1),
  accountId: z.string().nullable().optional(),
  region: dataRegionSchema.default("GLOBAL"),
  dataUsagePolicy: z.string().optional(),
  retentionBehavior: z.string().optional(),
  trainingBehavior: z.enum(["prohibited", "permitted", "unknown"]).default("unknown"),
  deletionCapability: z.enum(["supported", "unsupported", "manual"]).default("unsupported"),
  zeroRetentionCapability: z.boolean().default(false),
  effectiveFrom: z.coerce.date(),
  verifiedAt: z.coerce.date().nullable().optional(),
});
export type ProviderDataPolicy = z.infer<typeof providerDataPolicySchema>;

// ==========================================
// 6. Deletion Requests & Tasks
// ==========================================

export const deletionStatusSchema = z.enum([
  "REQUESTED",
  "VALIDATING",
  "QUEUED",
  "RUNNING",
  "PARTIAL",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
]);
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;

export const deletionScopeSchema = z.enum([
  "resource",
  "user",
  "workspace",
  "organization",
  "category",
  "time_range",
]);
export type DeletionScope = z.infer<typeof deletionScopeSchema>;

export const deletionRequestSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  workspaceId: z.string().nullable().optional(),
  requestedBy: z.string().min(1),
  scope: deletionScopeSchema,
  scopeTargetId: z.string().optional(), // resourceId, userId, etc.
  category: dataCategorySchema.optional(),
  status: deletionStatusSchema,
  reason: z.string().optional(),
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});
export type DeletionRequest = z.infer<typeof deletionRequestSchema>;

export const deletionProcessorTypeSchema = z.enum([
  "postgres",
  "redis",
  "object_storage",
  "cache",
  "vector_store",
  "analytics_store",
  "provider",
  "search_index",
]);
export type DeletionProcessorType = z.infer<typeof deletionProcessorTypeSchema>;

export const deletionTaskSchema = z.object({
  id: z.string().min(1),
  deletionRequestId: z.string().min(1),
  processor: deletionProcessorTypeSchema,
  resourceType: z.string().min(1),
  resourceId: z.string().optional(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  attemptCount: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});
export type DeletionTask = z.infer<typeof deletionTaskSchema>;

export const deletionEvidenceSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  deletionRequestId: z.string().min(1),
  processor: deletionProcessorTypeSchema,
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  verificationMethod: z.string().min(1),
  verificationHash: z.string().optional(),
  verifiedAt: z.coerce.date(),
  outcome: z.enum(["PURGED", "NOT_FOUND", "RETAINED_BY_HOLD", "FAILED"]),
});
export type DeletionEvidence = z.infer<typeof deletionEvidenceSchema>;

// ==========================================
// 7. Data Export Requests
// ==========================================

export const dataExportRequestSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  workspaceId: z.string().nullable().optional(),
  requestedBy: z.string().min(1),
  status: z.enum(["requested", "processing", "completed", "failed", "expired"]),
  outputFileId: z.string().nullable().optional(),
  downloadUrl: z.string().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
});
export type DataExportRequest = z.infer<typeof dataExportRequestSchema>;
