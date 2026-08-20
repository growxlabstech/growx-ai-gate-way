import { z } from "zod";
import { openAIChatCompletionRequestSchema } from "./ai.js";

export const batchJobStatusSchema = z.enum([
  "validating",
  "queued",
  "running",
  "finalizing",
  "completed",
  "partially_completed",
  "failed",
  "cancelling",
  "cancelled",
  "expired",
]);
export type BatchJobStatus = z.infer<typeof batchJobStatusSchema>;

export const batchItemStatusSchema = z.enum([
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "retry_wait",
  "cancelled",
]);
export type BatchItemStatus = z.infer<typeof batchItemStatusSchema>;

export const batchCompletionWindowSchema = z.enum(["1h", "6h", "24h"]);
export type BatchCompletionWindow = z.infer<typeof batchCompletionWindowSchema>;

export const batchEndpointSchema = z.enum([
  "/v1/chat/completions",
  "/v1/responses",
  "/v1/embeddings",
]);
export type BatchEndpoint = z.infer<typeof batchEndpointSchema>;

export const batchItemRequestSchema = z.object({
  custom_id: z.string().min(1).max(256),
  method: z.literal("POST").default("POST"),
  url: batchEndpointSchema.default("/v1/chat/completions"),
  body: openAIChatCompletionRequestSchema,
});
export type BatchItemRequest = z.infer<typeof batchItemRequestSchema>;

export const batchJobSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  createdByUserId: z.string().nullable().optional(),
  createdByApiKeyId: z.string().nullable().optional(),
  inputFileId: z.string().nullable().optional(),
  outputFileId: z.string().nullable().optional(),
  errorFileId: z.string().nullable().optional(),
  endpoint: batchEndpointSchema,
  status: batchJobStatusSchema,
  completionWindow: batchCompletionWindowSchema.default("24h"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  totalItems: z.number().int().default(0),
  pendingItems: z.number().int().default(0),
  runningItems: z.number().int().default(0),
  succeededItems: z.number().int().default(0),
  failedItems: z.number().int().default(0),
  cancelledItems: z.number().int().default(0),
  executionDeadlineAt: z.coerce.date().nullable().optional(),
  validatedAt: z.coerce.date().nullable().optional(),
  queuedAt: z.coerce.date().nullable().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  cancelledAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BatchJob = z.infer<typeof batchJobSchema>;

export const createBatchRequestSchema = z.object({
  input_file_id: z.string().optional(),
  items: z.array(batchItemRequestSchema).min(1).max(50000).optional(),
  endpoint: batchEndpointSchema.default("/v1/chat/completions"),
  completion_window: batchCompletionWindowSchema.default("24h"),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(data => !!data.input_file_id || (!!data.items && data.items.length > 0), {
  message: "Either input_file_id or items array must be provided",
});
export type CreateBatchRequest = z.infer<typeof createBatchRequestSchema>;

export const createBatchResponseSchema = z.object({
  batch: batchJobSchema,
});
export type CreateBatchResponse = z.infer<typeof createBatchResponseSchema>;

export const batchListQuerySchema = z.object({
  status: batchJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;

export const batchListResponseSchema = z.object({
  data: z.array(batchJobSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});
export type BatchListResponse = z.infer<typeof batchListResponseSchema>;

export const batchItemSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  organizationId: z.string(),
  customId: z.string(),
  position: z.number().int(),
  status: batchItemStatusSchema,
  attemptCount: z.number().int(),
  maxAttempts: z.number().int(),
  gatewayRequestId: z.string().nullable().optional(),
  responseReference: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCategory: z.string().nullable().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BatchItem = z.infer<typeof batchItemSchema>;

export const batchOutputRecordSchema = z.object({
  id: z.string(),
  custom_id: z.string(),
  response: z.object({
    status_code: z.number().int(),
    request_id: z.string(),
    body: z.record(z.string(), z.unknown()),
  }).nullable(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    category: z.string().optional(),
  }).nullable(),
});
export type BatchOutputRecord = z.infer<typeof batchOutputRecordSchema>;
