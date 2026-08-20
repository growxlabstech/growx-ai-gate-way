export * from "./domain/types.js";
export * from "./domain/storage-key.js";
export * from "./domain/mime-detector.js";
export * from "./domain/file-scanner.js";

export * from "./infrastructure/storage-provider.js";
export * from "./infrastructure/in-memory-storage-provider.js";
export * from "./infrastructure/s3-storage-provider.js";
export * from "./infrastructure/file-repository.js";

export * from "./application/file-service.js";
export * from "./application/provider-transfer-service.js";
export * from "./application/retention-worker.js";
export * from "./application/orphan-reconciler.js";

export * from "./transport/http-server.js";

import { InMemoryObjectStorageProvider } from "./infrastructure/in-memory-storage-provider.js";
import { InMemoryFileRepository } from "./infrastructure/file-repository.js";
import { TruthfulFileScanner } from "./domain/file-scanner.js";
import { FileService } from "./application/file-service.js";
import { createStorageHttpServer } from "./transport/http-server.js";

export const serviceName = "storage-service";

export function createApp() {
  const storageProvider = new InMemoryObjectStorageProvider();
  const repository = new InMemoryFileRepository();
  const scanner = new TruthfulFileScanner();
  const fileService = new FileService(storageProvider, repository, scanner);
  return createStorageHttpServer(fileService);
}
