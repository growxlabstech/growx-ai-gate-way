import { FileService } from "./file-service.js";

export interface OrphanReport {
  missingObjects: string[];
  reconciledAt: Date;
}

export class OrphanReconciler {
  constructor(private readonly fileService: FileService) {}

  async reconcileFiles(organizationId: string): Promise<OrphanReport> {
    const files = await this.fileService.repository.listFiles({
      organizationId,
      status: "ready",
      limit: 500,
    });

    const missingObjects: string[] = [];
    for (const file of files.data) {
      const head = await this.fileService.storageProvider.headObject(file.storageKey);
      if (!head) {
        missingObjects.push(file.id);
      }
    }

    return {
      missingObjects,
      reconciledAt: new Date(),
    };
  }
}
