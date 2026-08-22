import crypto from "node:crypto";
import {
  TenantContext,
  ProviderFileReference,
  StorageError,
} from "../domain/types.js";
import { FileService } from "./file-service.js";

export interface UpstreamProviderFileUploader {
  uploadFile(params: {
    providerId: string;
    credentialId?: string | null | undefined;
    fileName: string;
    mimeType: string;
    content: Buffer;
    purpose?: string | undefined;
  }): Promise<{ providerFileId: string; expiresAt?: Date | null | undefined }>;
}

export class MockUpstreamProviderFileUploader implements UpstreamProviderFileUploader {
  async uploadFile(params: {
    providerId: string;
    credentialId?: string | null | undefined;
    fileName: string;
    mimeType: string;
    content: Buffer;
    purpose?: string | undefined;
  }): Promise<{ providerFileId: string; expiresAt?: Date | null | undefined }> {
    const providerFileId = `prov_file_${params.providerId}_${crypto.randomBytes(8).toString("hex")}`;
    return {
      providerFileId,
      expiresAt: new Date(Date.now() + 86400 * 1000), // 24h
    };
  }
}

export class ProviderFileTransferService {
  constructor(
    private readonly fileService: FileService,
    private readonly uploader: UpstreamProviderFileUploader = new MockUpstreamProviderFileUploader(),
  ) {}

  async ensureProviderFile(
    tenant: TenantContext,
    fileId: string,
    providerId: string,
    credentialId?: string | null | undefined,
  ): Promise<ProviderFileReference> {
    const file = await this.fileService.getFile(tenant, fileId);
    if (file.status !== "ready") {
      throw new StorageError(
        "FILE_NOT_READY",
        `File ${fileId} is not in ready state for provider transfer`,
      );
    }

    // Check existing provider reference
    const existing = await this.fileService.repository.getProviderReference(
      fileId,
      providerId,
      credentialId,
    );
    const now = new Date();

    if (
      existing &&
      existing.providerStatus === "ready" &&
      (!existing.expiresAt || existing.expiresAt > now)
    ) {
      return existing;
    }

    // Read binary from storage provider
    const contentResult = await this.fileService.storageProvider.getObject(
      file.storageKey,
    );
    let buf: Buffer;
    if (Buffer.isBuffer(contentResult.body)) {
      buf = contentResult.body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of contentResult.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buf = Buffer.concat(chunks);
    }

    try {
      const uploadRes = await this.uploader.uploadFile({
        providerId,
        credentialId: credentialId ?? null,
        fileName: file.safeFileName,
        mimeType: file.detectedMimeType || file.mimeType,
        content: buf,
        purpose: file.purpose,
      });

      const ref: ProviderFileReference = {
        id: `pfr_${crypto.randomBytes(16).toString("hex")}`,
        fileId,
        providerId,
        providerCredentialId: credentialId || null,
        providerFileId: uploadRes.providerFileId,
        providerStatus: "ready",
        expiresAt: uploadRes.expiresAt || null,
        createdAt: now,
        updatedAt: now,
      };

      return this.fileService.repository.createProviderReference(ref);
    } catch (err: any) {
      // Local file remains ready! Failure is isolated to this provider attempt.
      throw new StorageError(
        "PROVIDER_TRANSFER_FAILED",
        `Failed to transfer file ${fileId} to provider ${providerId}: ${err.message}`,
      );
    }
  }
}
