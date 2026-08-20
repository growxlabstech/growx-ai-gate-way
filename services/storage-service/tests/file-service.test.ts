import { describe, it, expect, beforeEach } from "vitest";
import { FileService } from "../src/application/file-service.js";
import { InMemoryObjectStorageProvider } from "../src/infrastructure/in-memory-storage-provider.js";
import { InMemoryFileRepository } from "../src/infrastructure/file-repository.js";
import { TruthfulFileScanner } from "../src/domain/file-scanner.js";

describe("Phase 25: File Service & Tenant Isolation", () => {
  let storageProvider: InMemoryObjectStorageProvider;
  let repository: InMemoryFileRepository;
  let scanner: TruthfulFileScanner;
  let fileService: FileService;

  const tenantA = { organizationId: "org_tenant_a", workspaceId: "ws_a", userId: "usr_a" };
  const tenantB = { organizationId: "org_tenant_b", workspaceId: "ws_b", userId: "usr_b" };

  beforeEach(() => {
    storageProvider = new InMemoryObjectStorageProvider();
    repository = new InMemoryFileRepository();
    scanner = new TruthfulFileScanner();
    fileService = new FileService(storageProvider, repository, scanner);
  });

  it("1. Creates pending file, upload session, and issues short-lived signed upload URL", async () => {
    const createRes = await fileService.createFile(tenantA, {
      fileName: "user_avatar.png",
      purpose: "image_input",
      mimeType: "image/png",
      sizeBytes: 1024 * 100,
      uploadType: "single",
    });

    expect(createRes.file.id).toMatch(/^file_/);
    expect(createRes.file.status).toBe("pending_upload");
    expect(createRes.file.organizationId).toBe("org_tenant_a");
    expect(createRes.uploadUrl).toBeDefined();
    expect(createRes.uploadSessionId).toBeDefined();
  });

  it("2. Completes upload with magic byte sniffing, size check, and sets status to ready", async () => {
    const createRes = await fileService.createFile(tenantA, {
      fileName: "document.pdf",
      purpose: "document_input",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });

    const fileId = createRes.file.id;
    const storageKey = createRes.file.storageKey;

    const pdfData = Buffer.from("%PDF-1.7 test document content with sufficient bytes");
    await storageProvider.putObject(storageKey, pdfData, { contentType: "application/pdf" });

    const completeRes = await fileService.completeUpload(tenantA, fileId, {
      uploadSessionId: createRes.uploadSessionId,
      actualSizeBytes: pdfData.length,
    });

    expect(completeRes.file.status).toBe("ready");
    expect(completeRes.file.detectedMimeType).toBe("application/pdf");
    expect(completeRes.file.sizeBytes).toBe(pdfData.length);
    expect(completeRes.file.readyAt).toBeDefined();

    const dupRes = await fileService.completeUpload(tenantA, fileId, {
      uploadSessionId: createRes.uploadSessionId,
    });
    expect(dupRes.file.status).toBe("ready");
  });

  it("3. Enforces strict tenant isolation: Org B cannot read, download, complete, or delete Org A files", async () => {
    const createRes = await fileService.createFile(tenantA, {
      fileName: "secret_data.txt",
      purpose: "ai_input",
      mimeType: "text/plain",
      sizeBytes: 50,
    });

    const fileId = createRes.file.id;
    await storageProvider.putObject(createRes.file.storageKey, Buffer.from("Confidential data"));
    await fileService.completeUpload(tenantA, fileId, {
      uploadSessionId: createRes.uploadSessionId,
    });

    await expect(fileService.getFile(tenantB, fileId)).rejects.toThrowError(/not found/);
    await expect(fileService.getDownloadUrl(tenantB, fileId)).rejects.toThrowError(/not found/);

    // Org B delete attempt does not affect Org A's file
    await fileService.deleteFile(tenantB, fileId);
    const fileA = await fileService.getFile(tenantA, fileId);
    expect(fileA.status).toBe("ready");
  });

  it("4. Rejects completion when object is missing", async () => {
    const createRes = await fileService.createFile(tenantA, {
      fileName: "missing.png",
      purpose: "image_input",
      mimeType: "image/png",
      sizeBytes: 1000,
    });

    await expect(
      fileService.completeUpload(tenantA, createRes.file.id, {
        uploadSessionId: createRes.uploadSessionId,
      })
    ).rejects.toThrowError(/Object payload not found/);
  });

  it("5. Enforces storage quota reservations and prevents concurrent quota bypass", async () => {
    const quotaService = new FileService(storageProvider, repository, scanner, {
      maxStorageBytesPerOrg: 1000n,
    });

    await quotaService.createFile(tenantA, {
      fileName: "file1.txt",
      purpose: "ai_input",
      mimeType: "text/plain",
      sizeBytes: 600,
    });

    await expect(
      quotaService.createFile(tenantA, {
        fileName: "file2.txt",
        purpose: "ai_input",
        mimeType: "text/plain",
        sizeBytes: 500,
      })
    ).rejects.toThrowError(/Organization storage quota exceeded/);
  });

  it("6. Supports multipart upload creation and completion", async () => {
    const createRes = await fileService.createFile(tenantA, {
      fileName: "big_data.json",
      purpose: "ai_input",
      mimeType: "application/json",
      uploadType: "multipart",
      partCount: 2,
    });

    expect(createRes.uploadParts?.length).toBe(2);
    const session = await repository.getUploadSession(tenantA.organizationId, createRes.uploadSessionId);
    expect(session?.multipartUploadId).toBeDefined();

    const part1 = await storageProvider.uploadPart(createRes.file.storageKey, session!.multipartUploadId!, 1, Buffer.from('{"part1":'));
    const part2 = await storageProvider.uploadPart(createRes.file.storageKey, session!.multipartUploadId!, 2, Buffer.from('"value"}'));

    const completeRes = await fileService.completeUpload(tenantA, createRes.file.id, {
      uploadSessionId: createRes.uploadSessionId,
      parts: [part1, part2],
    });

    expect(completeRes.file.status).toBe("ready");
    expect(completeRes.file.sizeBytes).toBe(Buffer.from('{"part1":"value"}').length);
  });

  it("7. Platform kill switch immediately blocks new file creation", async () => {
    fileService.setKillSwitch(true);

    await expect(
      fileService.createFile(tenantA, {
        fileName: "test.txt",
        purpose: "ai_input",
        mimeType: "text/plain",
      })
    ).rejects.toThrowError(/temporarily disabled by platform kill switch/);
  });
});
