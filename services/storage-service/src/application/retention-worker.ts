import { FileService } from "./file-service.js";

export class FileRetentionWorker {
  constructor(private readonly fileService: FileService) {}

  async runRetentionPass(batchLimit = 50): Promise<{ expiredCount: number; deletedCount: number }> {
    const now = new Date();
    const expiredFiles = await this.fileService.repository.getExpiredFiles(now, batchLimit);
    let expiredCount = 0;
    let deletedCount = 0;

    for (const file of expiredFiles) {
      // Legal invoice documents MUST NOT be deleted by generic retention!
      if (file.purpose === "invoice_document") {
        continue;
      }

      file.status = "expired";
      await this.fileService.repository.updateFile(file);
      expiredCount++;

      // Soft or hard delete
      try {
        await this.fileService.storageProvider.deleteObject(file.storageKey);
        file.status = "deleted";
        file.deletedAt = now;
        await this.fileService.repository.updateFile(file);
        deletedCount++;
      } catch {
        // Log & proceed
      }
    }

    return { expiredCount, deletedCount };
  }

  async runSessionCleanupPass(batchLimit = 50): Promise<number> {
    const now = new Date();
    const sessions = await this.fileService.repository.getExpiredUploadSessions(now, batchLimit);
    let count = 0;

    for (const session of sessions) {
      session.status = "expired";
      await this.fileService.repository.updateUploadSession(session);
      count++;
    }

    return count;
  }
}
