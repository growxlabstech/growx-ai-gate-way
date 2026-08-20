import crypto from "node:crypto";
import { Readable } from "node:stream";
import { StorageObjectMetadata, SignedUrlOptions, UploadPartDescriptor, StorageError } from "../domain/types.js";
import { ObjectStorageProvider, PutObjectOptions, GetObjectResult } from "./storage-provider.js";

interface StoredItem {
  data: Buffer;
  contentType: string;
  checksumSha256: string;
  etag: string;
  lastModified: Date;
  metadata: Record<string, string>;
}

interface ActiveMultipart {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
  parts: Map<number, { data: Buffer; etag: string }>;
  createdAt: Date;
}

export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  public readonly providerName = "memory";
  private readonly objects = new Map<string, StoredItem>();
  private readonly multiparts = new Map<string, ActiveMultipart>();
  private outageSimulated = false;

  public setOutageSimulation(active: boolean): void {
    this.outageSimulated = active;
  }

  private checkHealth(): void {
    if (this.outageSimulated) {
      throw new StorageError("STORAGE_PROVIDER_ERROR", "Simulated storage provider outage");
    }
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | Readable,
    options?: PutObjectOptions
  ): Promise<StorageObjectMetadata> {
    this.checkHealth();
    let buf: Buffer;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buf = Buffer.concat(chunks);
    }

    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const etag = `"${crypto.createHash("md5").update(buf).digest("hex")}"`;
    const metadata: StorageObjectMetadata = {
      contentLength: buf.length,
      contentType: options?.contentType || "application/octet-stream",
      etag,
      checksumSha256: sha256,
      lastModified: new Date(),
      customMetadata: options?.metadata || {},
    };

    this.objects.set(key, {
      data: buf,
      contentType: metadata.contentType,
      checksumSha256: sha256,
      etag,
      lastModified: metadata.lastModified!,
      metadata: metadata.customMetadata || {},
    });

    return metadata;
  }

  async getObject(key: string, range?: { start: number; end?: number }): Promise<GetObjectResult> {
    this.checkHealth();
    const item = this.objects.get(key);
    if (!item) {
      throw new StorageError("FILE_NOT_FOUND", `Object not found at key: ${key}`);
    }

    let payload = item.data;
    if (range) {
      const start = Math.max(0, range.start);
      const end = range.end !== undefined ? Math.min(item.data.length - 1, range.end) : item.data.length - 1;
      payload = item.data.subarray(start, end + 1);
    }

    return {
      body: payload,
      metadata: {
        contentLength: payload.length,
        contentType: item.contentType,
        etag: item.etag,
        checksumSha256: item.checksumSha256,
        lastModified: item.lastModified,
        customMetadata: item.metadata,
      },
    };
  }

  async headObject(key: string): Promise<StorageObjectMetadata | null> {
    this.checkHealth();
    const item = this.objects.get(key);
    if (!item) return null;
    return {
      contentLength: item.data.length,
      contentType: item.contentType,
      etag: item.etag,
      checksumSha256: item.checksumSha256,
      lastModified: item.lastModified,
      customMetadata: item.metadata,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    this.checkHealth();
    return this.objects.delete(key);
  }

  async createSignedUploadUrl(
    key: string,
    options?: SignedUrlOptions
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    this.checkHealth();
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const token = crypto.randomBytes(16).toString("hex");
    const uploadUrl = `https://mock-storage.growx.internal/upload/${encodeURIComponent(key)}?expires=${expiresAt.getTime()}&sig=${token}`;
    return { uploadUrl, expiresAt };
  }

  async createSignedDownloadUrl(
    key: string,
    options?: SignedUrlOptions
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    this.checkHealth();
    const item = this.objects.get(key);
    if (!item) {
      throw new StorageError("FILE_NOT_FOUND", `Object not found at key: ${key}`);
    }
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const token = crypto.randomBytes(16).toString("hex");
    const downloadUrl = `https://mock-storage.growx.internal/download/${encodeURIComponent(key)}?expires=${expiresAt.getTime()}&sig=${token}`;
    return { downloadUrl, expiresAt };
  }

  async createMultipartUpload(key: string, options?: PutObjectOptions): Promise<{ uploadId: string }> {
    this.checkHealth();
    const uploadId = `mp_${crypto.randomBytes(12).toString("hex")}`;
    this.multiparts.set(uploadId, {
      key,
      contentType: options?.contentType || "application/octet-stream",
      metadata: options?.metadata || {},
      parts: new Map(),
      createdAt: new Date(),
    });
    return { uploadId };
  }

  async createSignedPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    options?: SignedUrlOptions
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    this.checkHealth();
    const mp = this.multiparts.get(uploadId);
    if (!mp || mp.key !== key) {
      throw new StorageError("UPLOAD_SESSION_INVALID", `Multipart upload ${uploadId} is invalid for key ${key}`);
    }
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const sig = crypto.randomBytes(16).toString("hex");
    const uploadUrl = `https://mock-storage.growx.internal/multipart/${uploadId}/part/${partNumber}?sig=${sig}`;
    return { uploadUrl, expiresAt };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array
  ): Promise<UploadPartDescriptor> {
    this.checkHealth();
    const mp = this.multiparts.get(uploadId);
    if (!mp || mp.key !== key) {
      throw new StorageError("UPLOAD_SESSION_INVALID", `Multipart upload ${uploadId} not found`);
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const etag = `"${crypto.createHash("md5").update(buf).digest("hex")}"`;
    mp.parts.set(partNumber, { data: buf, etag });
    return { partNumber, etag, sizeBytes: buf.length };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPartDescriptor[]
  ): Promise<StorageObjectMetadata> {
    this.checkHealth();
    const mp = this.multiparts.get(uploadId);
    if (!mp || mp.key !== key) {
      throw new StorageError("UPLOAD_SESSION_INVALID", `Multipart upload ${uploadId} not found`);
    }

    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const buffers: Buffer[] = [];
    for (const p of sorted) {
      const stored = mp.parts.get(p.partNumber);
      if (!stored) {
        throw new StorageError("UPLOAD_SESSION_INVALID", `Part ${p.partNumber} is missing in multipart upload`);
      }
      buffers.push(stored.data);
    }

    const total = Buffer.concat(buffers);
    this.multiparts.delete(uploadId);

    return this.putObject(key, total, {
      contentType: mp.contentType,
      metadata: mp.metadata,
    });
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<boolean> {
    this.checkHealth();
    const mp = this.multiparts.get(uploadId);
    if (!mp) return false;
    return this.multiparts.delete(uploadId);
  }

  async copyObject(sourceKey: string, destKey: string): Promise<StorageObjectMetadata> {
    this.checkHealth();
    const item = this.objects.get(sourceKey);
    if (!item) {
      throw new StorageError("FILE_NOT_FOUND", `Source object ${sourceKey} not found`);
    }
    return this.putObject(destKey, item.data, {
      contentType: item.contentType,
      metadata: item.metadata,
    });
  }

  public clear(): void {
    this.objects.clear();
    this.multiparts.clear();
  }

  public getRawObject(key: string): StoredItem | undefined {
    return this.objects.get(key);
  }
}
