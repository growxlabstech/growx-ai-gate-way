import crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  FileObject,
  FileUploadSession,
  TenantContext,
  CreateFileRequest,
  CreateFileResponse,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FileDownloadResponse,
  FileListQuery,
  FileListResponse,
  StorageError,
  SignedUploadPart,
} from "../domain/types.js";
import { generateStorageKey, sanitizeFileName } from "../domain/storage-key.js";
import { FileTypeDetector } from "../domain/mime-detector.js";
import { FileScanner, TruthfulFileScanner } from "../domain/file-scanner.js";
import { ObjectStorageProvider } from "../infrastructure/storage-provider.js";
import { FileRepository } from "../infrastructure/file-repository.js";

export interface FileServiceConfig {
  maxSingleUploadSizeBytes?: number;
  maxMultipartUploadSizeBytes?: number;
  defaultSignedUrlTtlSeconds?: number;
  maxStorageBytesPerOrg?: bigint;
}

export class FileService {
  private readonly maxSingleSizeBytes: number;
  private readonly maxMultipartSizeBytes: number;
  private readonly defaultSignedTtl: number;
  private readonly maxOrgStorageBytes: bigint;
  private killSwitchActive = false;

  constructor(
    public readonly storageProvider: ObjectStorageProvider,
    public readonly repository: FileRepository,
    public readonly scanner: FileScanner = new TruthfulFileScanner(),
    config: FileServiceConfig = {},
  ) {
    this.maxSingleSizeBytes =
      config.maxSingleUploadSizeBytes ?? 100 * 1024 * 1024; // 100MB
    this.maxMultipartSizeBytes =
      config.maxMultipartUploadSizeBytes ?? 5 * 1024 * 1024 * 1024; // 5GB
    this.defaultSignedTtl = config.defaultSignedUrlTtlSeconds ?? 900; // 15 mins
    this.maxOrgStorageBytes =
      config.maxStorageBytesPerOrg ?? 500n * 1024n * 1024n * 1024n; // 500GB
  }

  public setKillSwitch(active: boolean): void {
    this.killSwitchActive = active;
  }

  public isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  async createFile(
    tenant: TenantContext,
    request: CreateFileRequest,
  ): Promise<CreateFileResponse> {
    if (this.killSwitchActive) {
      throw new StorageError(
        "STORAGE_PROVIDER_ERROR",
        "File uploads are temporarily disabled by platform kill switch",
      );
    }

    const { organizationId, workspaceId, userId } = tenant;
    if (!organizationId) {
      throw new StorageError(
        "UNAUTHORIZED_TENANT",
        "Organization ID is required",
      );
    }

    const fileId = `file_${crypto.randomBytes(16).toString("hex")}`;
    const safeName = sanitizeFileName(request.fileName);
    const purpose = request.purpose || "ai_input";
    const declaredMime = request.mimeType || "application/octet-stream";

    // Validate purpose allowlist initially with declared MIME
    if (!FileTypeDetector.validatePurposeMime(purpose, declaredMime)) {
      throw new StorageError(
        "UNSUPPORTED_MIME_TYPE",
        `Declared MIME type ${declaredMime} is not allowed for purpose ${purpose}`,
      );
    }

    const maxAllowedSize =
      request.uploadType === "multipart"
        ? this.maxMultipartSizeBytes
        : this.maxSingleSizeBytes;
    const requestedSize = request.sizeBytes || maxAllowedSize;

    if (requestedSize > maxAllowedSize) {
      throw new StorageError(
        "FILE_SIZE_EXCEEDED",
        `Requested file size ${requestedSize} exceeds limit ${maxAllowedSize}`,
      );
    }

    // Storage quota check including active reservations
    const currentUsage = await this.repository.getStorageUsage(organizationId);
    const activeRes =
      await this.repository.getActiveReservations(organizationId);
    const reservedSum = activeRes.reduce((acc, r) => acc + r.reservedBytes, 0n);

    if (
      currentUsage.totalBytes + reservedSum + BigInt(requestedSize) >
      this.maxOrgStorageBytes
    ) {
      throw new StorageError(
        "STORAGE_QUOTA_EXCEEDED",
        "Organization storage quota exceeded",
      );
    }

    const storageKey = generateStorageKey({
      organizationId,
      workspaceId,
      fileId,
      safeFileName: safeName,
    });

    const now = new Date();
    const sessionTtlSeconds = Math.min(
      request.expiresInSeconds || this.defaultSignedTtl,
      86400,
    );
    const sessionExpiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);

    // Calculate file expiration based on retention
    let fileExpiresAt: Date | undefined;
    const retention = await this.repository.getRetentionPolicy(
      organizationId,
      purpose,
    );
    if (retention && !retention.permanent && retention.retentionSeconds) {
      fileExpiresAt = new Date(
        now.getTime() + retention.retentionSeconds * 1000,
      );
    } else if (purpose === "ai_input" || purpose === ("temporary" as any)) {
      fileExpiresAt = new Date(now.getTime() + 7 * 86400 * 1000); // 7 days default for AI input
    } else if (purpose === "invoice_document") {
      fileExpiresAt = undefined; // Permanent
    }

    const file: FileObject = {
      id: fileId,
      organizationId,
      workspaceId: workspaceId || null,
      ownerUserId: userId || null,
      purpose,
      status: "pending_upload",
      storageProvider: this.storageProvider.providerName,
      bucket: null,
      storageKey,
      originalFileName: request.fileName,
      safeFileName: safeName,
      mimeType: declaredMime,
      detectedMimeType: null,
      sizeBytes: 0,
      checksumSha256: null,
      etag: null,
      encryptionState: "provider_encrypted",
      safetyState: "not_scanned",
      metadata: request.metadata || {},
      uploadedAt: null,
      readyAt: null,
      expiresAt: fileExpiresAt || null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createFile(file);

    // Create Storage Reservation
    await this.repository.createStorageReservation({
      id: `res_${crypto.randomBytes(12).toString("hex")}`,
      fileId,
      organizationId,
      reservedBytes: BigInt(requestedSize),
      expiresAt: sessionExpiresAt,
      createdAt: now,
    });

    const sessionId = `sess_${crypto.randomBytes(16).toString("hex")}`;
    let uploadUrl: string | undefined;
    let uploadParts: SignedUploadPart[] | undefined;
    let multipartUploadId: string | null = null;

    if (request.uploadType === "multipart") {
      const partCount = Math.max(1, Math.min(request.partCount || 1, 1000));
      const mp = await this.storageProvider.createMultipartUpload(storageKey, {
        contentType: declaredMime,
      });
      multipartUploadId = mp.uploadId;
      uploadParts = [];

      for (let i = 1; i <= partCount; i++) {
        const partUrl = await this.storageProvider.createSignedPartUploadUrl(
          storageKey,
          mp.uploadId,
          i,
          { expiresInSeconds: sessionTtlSeconds },
        );
        uploadParts.push({
          partNumber: i,
          uploadUrl: partUrl.uploadUrl,
          expiresAt: partUrl.expiresAt,
        });
      }
    } else {
      const signed = await this.storageProvider.createSignedUploadUrl(
        storageKey,
        {
          expiresInSeconds: sessionTtlSeconds,
          contentType: declaredMime,
          maxSizeBytes: maxAllowedSize,
        },
      );
      uploadUrl = signed.uploadUrl;
    }

    const session: FileUploadSession = {
      id: sessionId,
      fileId,
      organizationId,
      status: "pending",
      uploadType: request.uploadType || "single",
      multipartUploadId,
      partCount: request.partCount || null,
      expiresAt: sessionExpiresAt,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createUploadSession(session);

    return {
      file,
      uploadSessionId: sessionId,
      uploadUrl,
      uploadParts,
      expiresAt: sessionExpiresAt,
      maxSizeBytes: maxAllowedSize,
    };
  }

  async completeUpload(
    tenant: TenantContext,
    fileId: string,
    request: CompleteFileUploadRequest,
  ): Promise<CompleteFileUploadResponse> {
    const file = await this.repository.getFile(tenant.organizationId, fileId);
    if (!file) {
      throw new StorageError("FILE_NOT_FOUND", `File ${fileId} not found`);
    }

    if (file.organizationId !== tenant.organizationId) {
      throw new StorageError(
        "UNAUTHORIZED_TENANT",
        "Unauthorized cross-tenant file completion attempt",
      );
    }

    if (file.status === "ready") {
      // Idempotent duplicate complete
      return { file };
    }

    const session = await this.repository.getUploadSession(
      tenant.organizationId,
      request.uploadSessionId,
    );
    if (!session || session.fileId !== fileId) {
      throw new StorageError(
        "UPLOAD_SESSION_INVALID",
        "Invalid upload session for file",
      );
    }

    if (session.status === "completed") {
      return { file };
    }

    const now = new Date();
    if (session.expiresAt <= now) {
      session.status = "expired";
      await this.repository.updateUploadSession(session);
      file.status = "expired";
      await this.repository.updateFile(file);
      throw new StorageError(
        "UPLOAD_SESSION_EXPIRED",
        "Upload session has expired",
      );
    }

    // Finalize multipart if needed
    if (session.uploadType === "multipart") {
      if (
        !session.multipartUploadId ||
        !request.parts ||
        request.parts.length === 0
      ) {
        throw new StorageError(
          "UPLOAD_SESSION_INVALID",
          "Multipart upload completion requires valid parts and uploadId",
        );
      }
      await this.storageProvider.completeMultipartUpload(
        file.storageKey,
        session.multipartUploadId,
        request.parts,
      );
    }

    // Verify object existence and retrieve metadata from storage provider
    const head = await this.storageProvider.headObject(file.storageKey);
    if (!head) {
      throw new StorageError(
        "FILE_NOT_READY",
        "Object payload not found in storage provider",
      );
    }

    const actualSize = head.contentLength;
    if (request.actualSizeBytes && request.actualSizeBytes !== actualSize) {
      throw new StorageError(
        "FILE_SIZE_MISMATCH",
        `Declared actual size ${request.actualSizeBytes} differs from storage payload ${actualSize}`,
      );
    }

    const maxLimit =
      session.uploadType === "multipart"
        ? this.maxMultipartSizeBytes
        : this.maxSingleSizeBytes;
    if (actualSize > maxLimit) {
      await this.storageProvider.deleteObject(file.storageKey);
      file.status = "rejected";
      await this.repository.updateFile(file);
      throw new StorageError(
        "FILE_SIZE_EXCEEDED",
        `Uploaded file size ${actualSize} exceeds max limit ${maxLimit}`,
      );
    }

    // Read initial slice for magic byte sniffing
    const sliceResult = await this.storageProvider.getObject(file.storageKey, {
      start: 0,
      end: 4096,
    });
    let headerBuf: Buffer;
    if (Buffer.isBuffer(sliceResult.body)) {
      headerBuf = sliceResult.body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of sliceResult.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      headerBuf = Buffer.concat(chunks);
    }

    const detected = FileTypeDetector.detectMimeType(headerBuf, file.mimeType);

    // Enforce safety (executable, archive, purpose allowlist, dangerous mismatch)
    try {
      FileTypeDetector.enforceMimeSafety({
        purpose: file.purpose,
        declaredMime: file.mimeType,
        detected,
      });
    } catch (err) {
      await this.storageProvider.deleteObject(file.storageKey);
      file.status = "rejected";
      await this.repository.updateFile(file);
      throw err;
    }

    // Run security scanner boundary
    const scanResult = await this.scanner.scan({
      fileId: file.id,
      storageKey: file.storageKey,
      sizeBytes: actualSize,
      mimeType: detected.detectedMimeType,
    });

    file.status = scanResult.state === "quarantined" ? "quarantined" : "ready";
    file.safetyState = scanResult.state;
    file.detectedMimeType = detected.detectedMimeType;
    file.sizeBytes = actualSize;
    file.etag = head.etag || request.etag || null;
    file.checksumSha256 = head.checksumSha256 || request.checksumSha256 || null;
    file.uploadedAt = now;
    file.readyAt = file.status === "ready" ? now : null;
    file.updatedAt = now;

    session.status = "completed";
    session.completedAt = now;

    // Release reservation
    await this.repository.deleteStorageReservation(fileId);
    await this.repository.updateUploadSession(session);
    const updated = await this.repository.updateFile(file);

    return { file: updated };
  }

  async getFile(tenant: TenantContext, fileId: string): Promise<FileObject> {
    const file = await this.repository.getFile(tenant.organizationId, fileId);
    if (!file) {
      throw new StorageError("FILE_NOT_FOUND", `File ${fileId} not found`);
    }
    if (file.organizationId !== tenant.organizationId) {
      throw new StorageError(
        "UNAUTHORIZED_TENANT",
        "Unauthorized cross-tenant file access attempt",
      );
    }
    return file;
  }

  async getDownloadUrl(
    tenant: TenantContext,
    fileId: string,
    options: { expiresInSeconds?: number } = {},
  ): Promise<FileDownloadResponse> {
    const file = await this.getFile(tenant, fileId);

    if (file.status === "quarantined") {
      throw new StorageError(
        "FILE_QUARANTINED",
        "File is quarantined and cannot be downloaded",
      );
    }
    if (file.status === "deleted") {
      throw new StorageError("FILE_DELETED", "File has been deleted");
    }
    if (file.status !== "ready") {
      throw new StorageError(
        "FILE_NOT_READY",
        "File is not ready for download",
      );
    }

    const safeDisposition = `attachment; filename="${file.safeFileName}"`;
    const signed = await this.storageProvider.createSignedDownloadUrl(
      file.storageKey,
      {
        expiresInSeconds: options.expiresInSeconds || this.defaultSignedTtl,
        contentType: file.detectedMimeType || file.mimeType,
        contentDisposition: safeDisposition,
      },
    );

    return {
      file,
      downloadUrl: signed.downloadUrl,
      expiresAt: signed.expiresAt,
      contentDisposition: safeDisposition,
    };
  }

  async getFileContentStream(
    tenant: TenantContext,
    fileId: string,
    range?: { start: number; end?: number },
  ): Promise<{ body: Buffer | Readable; file: FileObject }> {
    const file = await this.getFile(tenant, fileId);
    if (file.status === "quarantined") {
      throw new StorageError("FILE_QUARANTINED", "File is quarantined");
    }
    if (file.status !== "ready") {
      throw new StorageError("FILE_NOT_READY", "File is not ready");
    }

    const res = await this.storageProvider.getObject(file.storageKey, range);
    return {
      body: res.body,
      file,
    };
  }

  async deleteFile(tenant: TenantContext, fileId: string): Promise<boolean> {
    const file = await this.repository.getFile(tenant.organizationId, fileId);
    if (!file) return true; // Idempotent
    if (file.organizationId !== tenant.organizationId) {
      throw new StorageError(
        "UNAUTHORIZED_TENANT",
        "Unauthorized cross-tenant file deletion attempt",
      );
    }

    if (file.status === "deleted") {
      return true;
    }

    // Check active usage references
    const usages = await this.repository.getUsageReferences(fileId);
    if (usages.length > 0) {
      // Mark deleting or handle accordingly
    }

    // Remove provider references
    await this.repository.deleteProviderReferences(fileId);

    // Delete object in storage provider
    try {
      await this.storageProvider.deleteObject(file.storageKey);
    } catch {
      // Ignore if already gone
    }

    file.status = "deleted";
    file.deletedAt = new Date();
    await this.repository.updateFile(file);
    return true;
  }

  async listFiles(
    tenant: TenantContext,
    query: FileListQuery,
  ): Promise<FileListResponse> {
    return this.repository.listFiles({
      organizationId: tenant.organizationId,
      workspaceId: query.workspaceId || tenant.workspaceId,
      purpose: query.purpose,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  async quarantineFile(
    organizationId: string,
    fileId: string,
    reason: string,
  ): Promise<FileObject> {
    const file = await this.repository.getFile(organizationId, fileId);
    if (!file) {
      throw new StorageError("FILE_NOT_FOUND", `File ${fileId} not found`);
    }
    file.status = "quarantined";
    file.safetyState = "quarantined";
    file.metadata = { ...file.metadata, quarantineReason: reason };
    return this.repository.updateFile(file);
  }

  async restoreFile(
    organizationId: string,
    fileId: string,
  ): Promise<FileObject> {
    const file = await this.repository.getFile(organizationId, fileId);
    if (!file) {
      throw new StorageError("FILE_NOT_FOUND", `File ${fileId} not found`);
    }
    file.status = "ready";
    file.safetyState = "clean";
    return this.repository.updateFile(file);
  }
}
