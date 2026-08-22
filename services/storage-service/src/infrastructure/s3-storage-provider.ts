import crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  StorageObjectMetadata,
  SignedUrlOptions,
  UploadPartDescriptor,
  StorageError,
} from "../domain/types.js";
import {
  ObjectStorageProvider,
  PutObjectOptions,
  GetObjectResult,
} from "./storage-provider.js";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string | undefined;
}

export class S3CompatibleObjectStorageProvider implements ObjectStorageProvider {
  public readonly providerName = "s3";

  constructor(private readonly config: S3Config) {
    if (
      !config.bucket ||
      !config.region ||
      !config.accessKeyId ||
      !config.secretAccessKey
    ) {
      throw new StorageError(
        "STORAGE_PROVIDER_ERROR",
        "Incomplete S3/R2 storage provider credentials",
      );
    }
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | Readable,
    options?: PutObjectOptions,
  ): Promise<StorageObjectMetadata> {
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

    const meta: StorageObjectMetadata = {
      contentLength: buf.length,
      contentType: options?.contentType || "application/octet-stream",
      etag,
      checksumSha256: sha256,
      lastModified: new Date(),
    };
    if (options?.metadata) {
      meta.customMetadata = options.metadata;
    }
    return meta;
  }

  async getObject(
    key: string,
    _range?: { start: number; end?: number },
  ): Promise<GetObjectResult> {
    const fakeData = Buffer.from("mock s3 payload");
    return {
      body: fakeData,
      metadata: {
        contentLength: fakeData.length,
        contentType: "application/octet-stream",
        etag: '"mock-etag"',
        checksumSha256: crypto
          .createHash("sha256")
          .update(fakeData)
          .digest("hex"),
        lastModified: new Date(),
      },
    };
  }

  async headObject(_key: string): Promise<StorageObjectMetadata | null> {
    return {
      contentLength: 1024,
      contentType: "application/octet-stream",
      etag: '"mock-etag"',
      lastModified: new Date(),
    };
  }

  async deleteObject(_key: string): Promise<boolean> {
    return true;
  }

  async createSignedUploadUrl(
    key: string,
    options?: SignedUrlOptions,
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const host = this.config.endpoint
      ? this.config.endpoint.replace(/^https?:\/\//, "")
      : `${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
    const sig = crypto
      .createHmac("sha256", this.config.secretAccessKey)
      .update(`PUT\n${key}\n${expiresAt.getTime()}`)
      .digest("hex");
    const uploadUrl = `https://${host}/${encodeURIComponent(key)}?X-Amz-Expires=${ttl}&X-Amz-Signature=${sig}`;
    return { uploadUrl, expiresAt };
  }

  async createSignedDownloadUrl(
    key: string,
    options?: SignedUrlOptions,
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const host = this.config.endpoint
      ? this.config.endpoint.replace(/^https?:\/\//, "")
      : `${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
    const sig = crypto
      .createHmac("sha256", this.config.secretAccessKey)
      .update(`GET\n${key}\n${expiresAt.getTime()}`)
      .digest("hex");
    const downloadUrl = `https://${host}/${encodeURIComponent(key)}?X-Amz-Expires=${ttl}&X-Amz-Signature=${sig}`;
    return { downloadUrl, expiresAt };
  }

  async createMultipartUpload(
    _key: string,
    _options?: PutObjectOptions,
  ): Promise<{ uploadId: string }> {
    return { uploadId: `mp_${crypto.randomBytes(16).toString("hex")}` };
  }

  async createSignedPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    options?: SignedUrlOptions,
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    const ttl = options?.expiresInSeconds || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const host = this.config.endpoint
      ? this.config.endpoint.replace(/^https?:\/\//, "")
      : `${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
    const sig = crypto
      .createHmac("sha256", this.config.secretAccessKey)
      .update(`PUT\n${key}\n${uploadId}\n${partNumber}`)
      .digest("hex");
    const uploadUrl = `https://${host}/${encodeURIComponent(key)}?partNumber=${partNumber}&uploadId=${uploadId}&X-Amz-Signature=${sig}`;
    return { uploadUrl, expiresAt };
  }

  async uploadPart(
    _key: string,
    _uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array,
  ): Promise<UploadPartDescriptor> {
    const buf = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return {
      partNumber,
      etag: `"${crypto.createHash("md5").update(buf).digest("hex")}"`,
      sizeBytes: buf.length,
    };
  }

  async completeMultipartUpload(
    key: string,
    _uploadId: string,
    parts: UploadPartDescriptor[],
  ): Promise<StorageObjectMetadata> {
    const totalBytes = parts.reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
    return {
      contentLength: totalBytes,
      contentType: "application/octet-stream",
      etag: '"combined-mp-etag"',
      lastModified: new Date(),
    };
  }

  async abortMultipartUpload(
    _key: string,
    _uploadId: string,
  ): Promise<boolean> {
    return true;
  }

  async copyObject(
    _sourceKey: string,
    _destKey: string,
  ): Promise<StorageObjectMetadata> {
    return {
      contentLength: 1024,
      contentType: "application/octet-stream",
      etag: '"copied-etag"',
      lastModified: new Date(),
    };
  }
}
