import { z } from "zod";

// ==========================================
// 1. Provider Operation Types and Statuses
// ==========================================

export const providerOperationTypeSchema = z.enum([
  "provider_batch",
  "image_generation",
  "media_generation",
  "transcription",
  "async_inference",
  "provider_export",
]);
export type ProviderOperationType = z.infer<typeof providerOperationTypeSchema>;

export const providerOperationStatusSchema = z.enum([
  "created",
  "submitted",
  "queued",
  "running",
  "finalizing",
  "completed",
  "failed",
  "cancelling",
  "cancelled",
  "expired",
  "unknown",
]);
export type ProviderOperationStatus = z.infer<
  typeof providerOperationStatusSchema
>;

export const providerPollStrategySchema = z.enum([
  "poll",
  "callback",
  "hybrid",
]);
export type ProviderPollStrategy = z.infer<typeof providerPollStrategySchema>;

// ==========================================
// 2. Canonical ProviderOperation Entity
// ==========================================

export const providerOperationSchema = z.object({
  id: z.string().min(1), // GrowX owned ID (e.g. pop_...)
  organizationId: z.string().min(1),
  workspaceId: z.string().nullable().optional(),
  requestId: z.string().min(1),
  batchId: z.string().nullable().optional(),
  batchItemId: z.string().nullable().optional(),
  providerId: z.string().min(1),
  providerAccountId: z.string().nullable().optional(),
  routeId: z.string().min(1),
  canonicalModelId: z.string().min(1),
  providerOperationId: z.string().min(1), // Internal upstream provider operation ID
  operationType: providerOperationTypeSchema,
  status: providerOperationStatusSchema,
  pollStrategy: providerPollStrategySchema.default("poll"),
  attemptCount: z.number().int().nonnegative().default(0),
  resultReference: z.string().nullable().optional(),
  outputFileId: z.string().nullable().optional(),
  errorOutputFileId: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  leaseOwner: z.string().nullable().optional(),
  leaseExpiresAt: z.coerce.date().nullable().optional(),
  nextPollAt: z.coerce.date().nullable().optional(),
  lastPolledAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  submittedAt: z.coerce.date().nullable().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  failedAt: z.coerce.date().nullable().optional(),
  cancelledAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ProviderOperation = z.infer<typeof providerOperationSchema>;

// ==========================================
// 3. Provider Operation Attempts
// ==========================================

export const providerOperationAttemptTypeSchema = z.enum([
  "submission",
  "poll",
  "cancel",
  "fetch_result",
  "finalize",
  "reconcile",
]);
export type ProviderOperationAttemptType = z.infer<
  typeof providerOperationAttemptTypeSchema
>;

export const providerOperationAttemptSchema = z.object({
  id: z.string().min(1),
  providerOperationId: z.string().min(1),
  attemptType: providerOperationAttemptTypeSchema,
  attemptNumber: z.number().int().positive(),
  status: z.enum(["started", "succeeded", "failed"]),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});
export type ProviderOperationAttempt = z.infer<
  typeof providerOperationAttemptSchema
>;

// ==========================================
// 4. Provider Operation Callbacks
// ==========================================

export const providerOperationCallbackSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  providerEventId: z.string().nullable().optional(),
  providerOperationId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  signatureVerified: z.boolean().default(false),
  receivedAt: z.coerce.date(),
});
export type ProviderOperationCallback = z.infer<
  typeof providerOperationCallbackSchema
>;

// ==========================================
// 5. Query / Filter Schemas
// ==========================================

export const providerOperationFilterSchema = z.object({
  organizationId: z.string().optional(),
  workspaceId: z.string().optional(),
  providerId: z.string().optional(),
  status: z
    .union([
      providerOperationStatusSchema,
      z.array(providerOperationStatusSchema),
    ])
    .optional(),
  operationType: providerOperationTypeSchema.optional(),
  dueBefore: z.coerce.date().optional(),
  stuckSince: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(1000).default(50),
});
export type ProviderOperationFilter = z.infer<
  typeof providerOperationFilterSchema
>;
