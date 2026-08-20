import { describe, it, expect, beforeEach } from "vitest";
import { FileService } from "../src/application/file-service.js";
import { FileRetentionWorker } from "../src/application/retention-worker.js";
import { OrphanReconciler } from "../src/application/orphan-reconciler.js";
import { InMemoryObjectStorageProvider } from "../src/infrastructure/in-memory-storage-provider.js";
import { InMemoryFileRepository } from "../src/infrastructure/file-repository.js";
import { TruthfulFileScanner } from "../src/domain/file-scanner.js";

describe("Phase 25: File Retention & Orphan Reconciliation", () => {
  let storageProvider: InMemoryObjectStorageProvider;
  let repository: InMemoryFileRepository;
  let fileService: FileService;
  let retentionWorker: FileRetentionWorker;
  let orphanReconciler: OrphanReconciler;

  const tenant = { organizationId: "org_retention_test", workspaceId: "ws_1" };

  beforeEach(() => {
    storageProvider = new InMemoryObjectStorageProvider();
    repository = new InMemoryFileRepository();
    fileService = new FileService(storageProvider, repository, new TruthfulFileScanner());
    retentionWorker = new FileRetentionWorker(fileService);
    orphanReconciler = new OrphanReconciler(fileService);
  });

  it("1. Cleans expired temporary AI files but STRICTLY PRESERVES legal invoice documents", async () => {
    const tempFileRes = await fileService.createFile(tenant, {
      fileName: "temp_prompt_data.txt",
      purpose: "ai_input",
      mimeType: "text/plain",
      sizeBytes: 100,
    });
    await storageProvider.putObject(tempFileRes.file.storageKey, Buffer.from("temp data"));
    const tempReady = await fileService.completeUpload(tenant, tempFileRes.file.id, {
      uploadSessionId: tempFileRes.uploadSessionId,
    });
    tempReady.file.expiresAt = new Date(Date.now() - 3600 * 1000);
    await repository.updateFile(tempReady.file);

    const invoiceFileRes = await fileService.createFile(tenant, {
      fileName: "invoice_2026_001.pdf",
      purpose: "invoice_document",
      mimeType: "application/pdf",
      sizeBytes: 200,
    });
    await storageProvider.putObject(invoiceFileRes.file.storageKey, Buffer.from("%PDF invoice content"));
    const invoiceReady = await fileService.completeUpload(tenant, invoiceFileRes.file.id, {
      uploadSessionId: invoiceFileRes.uploadSessionId,
    });
    invoiceReady.file.expiresAt = new Date(Date.now() - 3600 * 1000);
    await repository.updateFile(invoiceReady.file);

    const report = await retentionWorker.runRetentionPass();
    expect(report.expiredCount).toBe(1);

    const tempAfter = await repository.getFile(tenant.organizationId, tempFileRes.file.id);
    expect(tempAfter?.status).toBe("deleted");
    expect(await storageProvider.headObject(tempFileRes.file.storageKey)).toBeNull();

    const invoiceAfter = await repository.getFile(tenant.organizationId, invoiceFileRes.file.id);
    expect(invoiceAfter?.status).toBe("ready");
    expect(await storageProvider.headObject(invoiceFileRes.file.storageKey)).not.toBeNull();
  });

  it("2. Cleans up stale pending upload sessions", async () => {
    const createRes = await fileService.createFile(tenant, {
      fileName: "stale.png",
      purpose: "image_input",
      mimeType: "image/png",
    });

    const session = await repository.getUploadSession(tenant.organizationId, createRes.uploadSessionId);
    session!.expiresAt = new Date(Date.now() - 1000);
    await repository.updateUploadSession(session!);

    const cleanedCount = await retentionWorker.runSessionCleanupPass();
    expect(cleanedCount).toBe(1);

    const sessionAfter = await repository.getUploadSession(tenant.organizationId, createRes.uploadSessionId);
    expect(sessionAfter?.status).toBe("expired");
  });

  it("3. Detects orphan files missing from object storage", async () => {
    const createRes = await fileService.createFile(tenant, {
      fileName: "orphan.txt",
      purpose: "ai_input",
      mimeType: "text/plain",
    });
    await storageProvider.putObject(createRes.file.storageKey, Buffer.from("data"));
    await fileService.completeUpload(tenant, createRes.file.id, {
      uploadSessionId: createRes.uploadSessionId,
    });

    await storageProvider.deleteObject(createRes.file.storageKey);

    const report = await orphanReconciler.reconcileFiles(tenant.organizationId);
    expect(report.missingObjects).toContain(createRes.file.id);
  });
});
