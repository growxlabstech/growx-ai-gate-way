import type {
  DataExportRequest,
} from "@growx/contracts";
import type { IGovernanceRepository } from "./repository.js";

export class DataExportManager {
  constructor(
    private repository: IGovernanceRepository,
    private fileService?: any
  ) {}

  public async processExport(exportId: string): Promise<DataExportRequest> {
    const req = await this.repository.getExportRequest(exportId);
    if (!req) throw new Error(`ExportRequest '${exportId}' not found`);

    await this.repository.updateExportRequest(exportId, { status: "processing" });

    // Collect governed customer data resources
    const resources = await this.repository.findResourcesByScope({
      organizationId: req.organizationId,
      workspaceId: req.workspaceId || undefined,
      limit: 1000,
    });

    // Package structured customer export data without internal secrets
    const exportPayload = {
      version: "1.0",
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      exportedAt: new Date().toISOString(),
      governedResources: resources.map((r) => ({
        id: r.id,
        category: r.dataCategory,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        createdAt: r.createdAt,
      })),
    };

    let outputFileId = `file_export_${req.id}`;
    let downloadUrl = `https://exports.growx.internal/${req.organizationId}/${exportId}.json`;

    if (this.fileService?.createFileFromBuffer) {
      const fileObj = await this.fileService.createFileFromBuffer({
        organizationId: req.organizationId,
        workspaceId: req.workspaceId,
        purpose: "batch_output",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(exportPayload, null, 2)),
        originalFileName: `export_${req.id}.json`,
      });
      if (fileObj) {
        outputFileId = fileObj.id;
      }
    }

    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000); // 7 day retention for exports
    return this.repository.updateExportRequest(exportId, {
      status: "completed",
      outputFileId,
      downloadUrl,
      expiresAt,
      completedAt: new Date(),
    });
  }
}
