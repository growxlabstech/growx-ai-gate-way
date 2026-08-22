import { describe, it, expect, beforeEach } from "vitest";
import { FileService } from "../src/application/file-service.js";
import {
  ProviderFileTransferService,
  MockUpstreamProviderFileUploader,
} from "../src/application/provider-transfer-service.js";
import { InMemoryObjectStorageProvider } from "../src/infrastructure/in-memory-storage-provider.js";
import { InMemoryFileRepository } from "../src/infrastructure/file-repository.js";
import { TruthfulFileScanner } from "../src/domain/file-scanner.js";

describe("Phase 25: Provider File Transfer & Reference Lifecycle", () => {
  let storageProvider: InMemoryObjectStorageProvider;
  let repository: InMemoryFileRepository;
  let fileService: FileService;
  let transferService: ProviderFileTransferService;

  const tenant = { organizationId: "org_prov_test", workspaceId: "ws_1" };

  beforeEach(() => {
    storageProvider = new InMemoryObjectStorageProvider();
    repository = new InMemoryFileRepository();
    fileService = new FileService(
      storageProvider,
      repository,
      new TruthfulFileScanner(),
    );
    transferService = new ProviderFileTransferService(
      fileService,
      new MockUpstreamProviderFileUploader(),
    );
  });

  it("1. Transfers local file to upstream provider and persists reference", async () => {
    const createRes = await fileService.createFile(tenant, {
      fileName: "vision_input.png",
      purpose: "image_input",
      mimeType: "image/png",
    });
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    await storageProvider.putObject(createRes.file.storageKey, pngData, {
      contentType: "image/png",
    });
    await fileService.completeUpload(tenant, createRes.file.id, {
      uploadSessionId: createRes.uploadSessionId,
    });

    const pfr = await transferService.ensureProviderFile(
      tenant,
      createRes.file.id,
      "openai",
      "cred_123",
    );
    expect(pfr.providerFileId).toMatch(/^prov_file_openai_/);
    expect(pfr.providerStatus).toBe("ready");
    expect(pfr.providerCredentialId).toBe("cred_123");

    const pfr2 = await transferService.ensureProviderFile(
      tenant,
      createRes.file.id,
      "openai",
      "cred_123",
    );
    expect(pfr2.id).toBe(pfr.id);
    expect(pfr2.providerFileId).toBe(pfr.providerFileId);
  });

  it("2. Re-uploads when provider reference is expired", async () => {
    const createRes = await fileService.createFile(tenant, {
      fileName: "data.txt",
      purpose: "ai_input",
      mimeType: "text/plain",
    });
    await storageProvider.putObject(
      createRes.file.storageKey,
      Buffer.from("test"),
    );
    await fileService.completeUpload(tenant, createRes.file.id, {
      uploadSessionId: createRes.uploadSessionId,
    });

    const pfr1 = await transferService.ensureProviderFile(
      tenant,
      createRes.file.id,
      "anthropic",
    );
    pfr1.expiresAt = new Date(Date.now() - 1000);
    await repository.createProviderReference(pfr1);

    const pfr2 = await transferService.ensureProviderFile(
      tenant,
      createRes.file.id,
      "anthropic",
    );
    expect(pfr2.providerFileId).not.toBe(pfr1.providerFileId);
  });

  it("3. Isolates transfer failure: local file remains ready even if upstream provider fails", async () => {
    const failingUploader = {
      async uploadFile(): Promise<any> {
        throw new Error("OpenAI API 503 Service Unavailable");
      },
    };
    const failingTransfer = new ProviderFileTransferService(
      fileService,
      failingUploader,
    );

    const createRes = await fileService.createFile(tenant, {
      fileName: "important.pdf",
      purpose: "document_input",
      mimeType: "application/pdf",
    });
    await storageProvider.putObject(
      createRes.file.storageKey,
      Buffer.from("%PDF-1.7"),
    );
    await fileService.completeUpload(tenant, createRes.file.id, {
      uploadSessionId: createRes.uploadSessionId,
    });

    await expect(
      failingTransfer.ensureProviderFile(tenant, createRes.file.id, "openai"),
    ).rejects.toThrowError(/Failed to transfer file/);

    const localFile = await fileService.getFile(tenant, createRes.file.id);
    expect(localFile.status).toBe("ready");
  });
});
