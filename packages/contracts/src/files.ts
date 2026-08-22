import { z } from "zod";

export const fileStatusSchema = z.enum([
  "pending_upload",
  "uploading",
  "uploaded",
  "processing",
  "ready",
  "rejected",
  "quarantined",
  "deleting",
  "deleted",
  "expired",
  "failed",
]);
export type FileStatus = z.infer<typeof fileStatusSchema>;

export const filePurposeSchema = z.enum([
  "ai_input",
  "image_input",
  "audio_input",
  "document_input",
  "batch_input",
  "batch_output",
  "invoice_document",
  "generated_artifact",
  "provider_transfer",
  "internal",
]);
export type FilePurpose = z.infer<typeof filePurposeSchema>;

export const fileSafetyStateSchema = z.enum([
  "not_scanned",
  "pending",
  "clean",
  "rejected",
  "quarantined",
]);
export type FileSafetyState = z.infer<typeof fileSafetyStateSchema>;

export const fileUploadTypeSchema = z.enum(["single", "multipart"]);
export type FileUploadType = z.infer<typeof fileUploadTypeSchema>;

export const fileObjectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  purpose: filePurposeSchema,
  status: fileStatusSchema,
  storageProvider: z.string(),
  bucket: z.string().nullable().optional(),
  storageKey: z.string(),
  originalFileName: z.string(),
  safeFileName: z.string(),
  mimeType: z.string(),
  detectedMimeType: z.string().nullable().optional(),
  sizeBytes: z.coerce.number().int().nonnegative(),
  checksumSha256: z.string().nullable().optional(),
  etag: z.string().nullable().optional(),
  encryptionState: z.string(),
  safetyState: fileSafetyStateSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  uploadedAt: z.coerce.date().nullable().optional(),
  readyAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type FileObject = z.infer<typeof fileObjectSchema>;

export const createFileRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  purpose: filePurposeSchema.default("ai_input"),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().optional(),
  uploadType: fileUploadTypeSchema.default("single").optional(),
  partCount: z.number().int().positive().max(10000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .max(86400 * 365)
    .optional(),
});
export type CreateFileRequest = z.infer<typeof createFileRequestSchema>;

export const signedUploadPartSchema = z.object({
  partNumber: z.number().int().positive(),
  uploadUrl: z.string().url(),
  expiresAt: z.coerce.date(),
});
export type SignedUploadPart = z.infer<typeof signedUploadPartSchema>;

export const createFileResponseSchema = z.object({
  file: fileObjectSchema,
  uploadSessionId: z.string(),
  uploadUrl: z.string().url().optional(),
  uploadParts: z.array(signedUploadPartSchema).optional(),
  expiresAt: z.coerce.date(),
  maxSizeBytes: z.number().int().positive(),
});
export type CreateFileResponse = z.infer<typeof createFileResponseSchema>;

export const completedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
});
export type CompletedPart = z.infer<typeof completedPartSchema>;

export const completeFileUploadRequestSchema = z.object({
  uploadSessionId: z.string(),
  etag: z.string().optional(),
  parts: z.array(completedPartSchema).optional(),
  checksumSha256: z.string().optional(),
  actualSizeBytes: z.number().int().nonnegative().optional(),
});
export type CompleteFileUploadRequest = z.infer<
  typeof completeFileUploadRequestSchema
>;

export const completeFileUploadResponseSchema = z.object({
  file: fileObjectSchema,
});
export type CompleteFileUploadResponse = z.infer<
  typeof completeFileUploadResponseSchema
>;

export const fileDownloadResponseSchema = z.object({
  file: fileObjectSchema,
  downloadUrl: z.string().url(),
  expiresAt: z.coerce.date(),
  contentDisposition: z.string(),
});
export type FileDownloadResponse = z.infer<typeof fileDownloadResponseSchema>;

export const fileListQuerySchema = z.object({
  purpose: filePurposeSchema.optional(),
  status: fileStatusSchema.optional(),
  workspaceId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type FileListQuery = z.infer<typeof fileListQuerySchema>;

export const fileListResponseSchema = z.object({
  data: z.array(fileObjectSchema),
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean(),
});
export type FileListResponse = z.infer<typeof fileListResponseSchema>;
