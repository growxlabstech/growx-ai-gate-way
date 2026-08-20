import { Readable } from "node:stream";
import { StorageObjectMetadata, SignedUrlOptions, UploadPartDescriptor } from "../domain/types.js";

export interface PutObjectOptions {
  contentType?: string;
  checksumSha256?: string;
  metadata?: Record<string, string>;
}

export interface GetObjectResult {
  body: Buffer | Readable;
  metadata: StorageObjectMetadata;
}

export interface ObjectStorageProvider {
  readonly providerName: string;
  putObject(key: string, data: Buffer | Uint8Array | Readable, options?: PutObjectOptions): Promise<StorageObjectMetadata>;
  getObject(key: string, range?: { start: number; end?: number }): Promise<GetObjectResult>;
  headObject(key: string): Promise<StorageObjectMetadata | null>;
  deleteObject(key: string): Promise<boolean>;
  createSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<{ uploadUrl: string; expiresAt: Date }>;
  createSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<{ downloadUrl: string; expiresAt: Date }>;
  createMultipartUpload(key: string, options?: PutObjectOptions): Promise<{ uploadId: string }>;
  createSignedPartUploadUrl(key: string, uploadId: string, partNumber: number, options?: SignedUrlOptions): Promise<{ uploadUrl: string; expiresAt: Date }>;
  uploadPart(key: string, uploadId: string, partNumber: number, data: Buffer | Uint8Array): Promise<UploadPartDescriptor>;
  completeMultipartUpload(key: string, uploadId: string, parts: UploadPartDescriptor[]): Promise<StorageObjectMetadata>;
  abortMultipartUpload(key: string, uploadId: string): Promise<boolean>;
  copyObject(sourceKey: string, destKey: string): Promise<StorageObjectMetadata>;
}
