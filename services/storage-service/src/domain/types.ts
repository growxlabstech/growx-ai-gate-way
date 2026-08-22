import {
  FileObject,
  FileStatus,
  FilePurpose,
  FileSafetyState,
  FileUploadType,
  CreateFileRequest,
  CreateFileResponse,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FileDownloadResponse,
  FileListQuery,
  FileListResponse,
  SignedUploadPart,
} from "@growx/contracts";

export type {
  FileObject,
  FileStatus,
  FilePurpose,
  FileSafetyState,
  FileUploadType,
  CreateFileRequest,
  CreateFileResponse,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FileDownloadResponse,
  FileListQuery,
  FileListResponse,
  SignedUploadPart,
};

export interface TenantContext {
  organizationId: string;
  workspaceId?: string | null | undefined;
  userId?: string | null | undefined;
  actorType?: "user" | "service" | "apiKey" | "admin" | "system" | undefined;
}

export interface FileUploadSession {
  id: string;
  fileId: string;
  organizationId: string;
  status: "pending" | "active" | "completed" | "aborted" | "expired";
  uploadType: FileUploadType;
  multipartUploadId?: string | null | undefined;
  partCount?: number | null | undefined;
  expiresAt: Date;
  completedAt?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderFileReference {
  id: string;
  fileId: string;
  providerId: string;
  providerCredentialId?: string | null | undefined;
  providerFileId: string;
  providerStatus: "pending" | "ready" | "expired" | "failed";
  expiresAt?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileUsageReference {
  id: string;
  fileId: string;
  referenceType: string;
  referenceId: string;
  createdAt: Date;
}

export interface FileStorageReservation {
  id: string;
  fileId: string;
  organizationId: string;
  reservedBytes: bigint;
  expiresAt: Date;
  createdAt: Date;
}

export interface FileRetentionPolicy {
  id: string;
  organizationId?: string | null | undefined;
  purpose: FilePurpose;
  retentionSeconds?: number | null | undefined;
  permanent: boolean;
  deletionMode: "soft" | "hard";
  createdAt: Date;
  updatedAt: Date;
}

export interface FileSafetyStatus {
  state: FileSafetyState;
  scanner?: string | null | undefined;
  reason?: string | null | undefined;
  checkedAt?: Date | null | undefined;
}

export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string;
  etag?: string | undefined;
  lastModified?: Date | undefined;
  checksumSha256?: string | undefined;
  customMetadata?: Record<string, string> | undefined;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number | undefined;
  contentType?: string | undefined;
  contentDisposition?: string | undefined;
  maxSizeBytes?: number | undefined;
}

export interface UploadPartDescriptor {
  partNumber: number;
  etag: string;
  sizeBytes?: number | undefined;
}

export type StorageErrorCode =
  | "FILE_NOT_FOUND"
  | "UNAUTHORIZED_TENANT"
  | "INVALID_STORAGE_KEY"
  | "UNSUPPORTED_MIME_TYPE"
  | "MIME_TYPE_MISMATCH"
  | "FILE_SIZE_EXCEEDED"
  | "FILE_SIZE_MISMATCH"
  | "UPLOAD_SESSION_EXPIRED"
  | "UPLOAD_SESSION_INVALID"
  | "STORAGE_QUOTA_EXCEEDED"
  | "FILE_QUARANTINED"
  | "FILE_DELETED"
  | "FILE_NOT_READY"
  | "PROVIDER_TRANSFER_FAILED"
  | "STORAGE_PROVIDER_ERROR"
  | "PATH_TRAVERSAL_DETECTED"
  | "DANGEROUS_FILE_REJECTED";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
