import type { FileService } from "@growx/storage-service";
import type { CreditService } from "@growx/credit-service";
import type { AuditService } from "@growx/audit-service";
import type { BatchRepository } from "../infrastructure/batch-repository.js";
import type {
  BatchJobRecord,
  BatchJobStatus,
  BatchOutputRecord,
} from "../domain/types.js";
import { isTerminalItemStatus } from "../domain/state-machine.js";

export interface BatchFinalizerDependencies {
  batchRepository: BatchRepository;
  fileService?: FileService;
  creditService?: CreditService;
  auditService?: AuditService;
  webhookService?: any;
  notificationService?: any;
}

export class BatchFinalizer {
  private readonly repo: BatchRepository;
  private readonly fileService?: FileService;
  private readonly creditService?: CreditService;
  private readonly auditService?: AuditService;
  private readonly webhookService?: any;
  private readonly notificationService?: any;

  constructor(deps: BatchFinalizerDependencies) {
    this.repo = deps.batchRepository;
    this.fileService = deps.fileService;
    this.creditService = deps.creditService;
    this.auditService = deps.auditService;
    this.webhookService = deps.webhookService;
    this.notificationService = deps.notificationService;
  }

  /**
   * Finalize a completed, cancelled, or failed batch job
   */
  public async finalizeBatch(batchId: string): Promise<BatchJobRecord | null> {
    const job = await this.repo.getBatchJobById(batchId);
    if (!job) return null;

    // Check if already in terminal state
    const terminalStates: BatchJobStatus[] = [
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
      "expired",
    ];
    if (terminalStates.includes(job.status)) {
      return job;
    }

    const items = await this.repo.getAllBatchItems(batchId);
    const allTerminal =
      items.length === 0 || items.every((i) => isTerminalItemStatus(i.status));

    // If job is running or queued but not all items are terminal, do not finalize unless cancelling
    if (
      !allTerminal &&
      (job.status as string) !== "cancelling" &&
      (job.status as string) !== "expired"
    ) {
      return job;
    }

    // Set job status to 'finalizing'
    await this.repo.updateBatchJobStatus(batchId, "finalizing");

    const succeededItems = items.filter((i) => i.status === "succeeded");
    const failedItems = items.filter((i) => i.status === "failed");
    const cancelledItems = items.filter((i) => i.status === "cancelled");

    let finalStatus: BatchJobStatus = "completed";
    if (
      job.status === "cancelling" ||
      (cancelledItems.length > 0 &&
        succeededItems.length === 0 &&
        failedItems.length === 0)
    ) {
      finalStatus = "cancelled";
    } else if (failedItems.length > 0 && succeededItems.length > 0) {
      finalStatus = "partially_completed";
    } else if (failedItems.length > 0 && succeededItems.length === 0) {
      finalStatus = "failed";
    } else {
      finalStatus = "completed";
    }

    let outputFileId: string | null = null;
    let errorFileId: string | null = null;

    // Stream assemble output JSONL file if fileService is configured
    if (this.fileService && items.length > 0) {
      try {
        const outputRecords: BatchOutputRecord[] = items.map((item) => {
          if (item.status === "succeeded" && item.responsePayload) {
            return {
              id: item.id,
              custom_id: item.customId,
              response: {
                status_code: 200,
                request_id: item.gatewayRequestId ?? item.id,
                body: item.responsePayload as any,
              },
              error: null,
            };
          } else {
            return {
              id: item.id,
              custom_id: item.customId,
              response: null,
              error: {
                code: item.errorCode ?? "batch_item_failed",
                message: item.errorMessage ?? "Item failed execution",
                category: item.errorCategory ?? "runtime_error",
              },
            };
          }
        });

        const jsonlContent =
          outputRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
        const tenant = {
          organizationId: job.organizationId,
          workspaceId: job.workspaceId ?? undefined,
          userId: job.createdByUserId ?? undefined,
        };

        const createRes = await this.fileService.createFile(tenant, {
          fileName: `batch_${job.id}_output.jsonl`,
          purpose: "batch_output",
          mimeType: "application/jsonl",
          uploadType: "single",
          sizeBytes: Buffer.byteLength(jsonlContent, "utf8"),
        });

        await this.fileService.storageProvider.putObject(
          createRes.file.storageKey,
          Buffer.from(jsonlContent, "utf8"),
          { contentType: "application/jsonl" },
        );

        const completeRes = await this.fileService.completeUpload(
          tenant,
          createRes.file.id,
          {
            uploadSessionId: createRes.uploadSessionId,
          },
        );
        outputFileId = completeRes.file.id;

        // If any items failed, create dedicated error file
        if (failedItems.length > 0) {
          const errorRecords = failedItems.map((item) => ({
            id: item.id,
            custom_id: item.customId,
            error: {
              code: item.errorCode ?? "batch_item_failed",
              message: item.errorMessage ?? "Item failed execution",
              category: item.errorCategory ?? "runtime_error",
            },
          }));
          const errorJsonl =
            errorRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
          const createErrRes = await this.fileService.createFile(tenant, {
            fileName: `batch_${job.id}_errors.jsonl`,
            purpose: "batch_output",
            mimeType: "application/jsonl",
            uploadType: "single",
            sizeBytes: Buffer.byteLength(errorJsonl, "utf8"),
          });
          await this.fileService.storageProvider.putObject(
            createErrRes.file.storageKey,
            Buffer.from(errorJsonl, "utf8"),
            { contentType: "application/jsonl" },
          );
          const completeErrRes = await this.fileService.completeUpload(
            tenant,
            createErrRes.file.id,
            {
              uploadSessionId: createErrRes.uploadSessionId,
            },
          );
          errorFileId = completeErrRes.file.id;
        }
      } catch (err) {
        console.error(
          `Failed to create output/error files for batch ${batchId}:`,
          err,
        );
      }
    }

    // Release remaining reservation if creditService available
    const reservation = await this.repo.getReservation(batchId);
    if (
      reservation &&
      reservation.status === "reserved" &&
      this.creditService
    ) {
      try {
        await this.repo.updateReservation({
          ...reservation,
          status: "released",
          releasedAt: new Date(),
        });
      } catch (err) {
        console.error(
          `Failed to release reservation for batch ${batchId}:`,
          err,
        );
      }
    }

    // Update job to final status
    const completedJob = await this.repo.updateBatchJobStatus(
      batchId,
      finalStatus,
      {
        outputFileId,
        errorFileId,
        succeededItems: succeededItems.length,
        failedItems: failedItems.length,
        cancelledItems: cancelledItems.length,
        completedAt: new Date(),
      },
    );

    // Emit lifecycle webhook & notification (single notification per batch)
    try {
      if (this.webhookService) {
        await this.webhookService.dispatchEvent?.({
          type: `batch.${finalStatus}.v1`,
          organizationId: job.organizationId,
          workspaceId: job.workspaceId,
          data: {
            batchId: job.id,
            status: finalStatus,
            totalItems: job.totalItems,
            succeededItems: succeededItems.length,
            failedItems: failedItems.length,
            outputFileId,
            errorFileId,
          },
        });
      }

      if (this.notificationService) {
        await this.notificationService.sendNotification?.({
          organizationId: job.organizationId,
          userId: job.createdByUserId,
          type: "batch_completed",
          title: `Batch Job ${job.id} ${finalStatus}`,
          body: `Batch execution finished with status: ${finalStatus}. Succeeded: ${succeededItems.length}, Failed: ${failedItems.length}`,
          metadata: { batchId: job.id, status: finalStatus },
        });
      }

      if (this.auditService) {
        await (this.auditService as any).recordEvent?.({
          action: "batch.finalized",
          organizationId: job.organizationId,
          workspaceId: job.workspaceId,
          actorId: job.createdByUserId ?? job.createdByApiKeyId ?? "system",
          metadata: {
            batchId: job.id,
            finalStatus,
            succeeded: succeededItems.length,
            failed: failedItems.length,
          },
        });
      }
    } catch (err) {
      console.error(
        `Failed to emit finalization notifications for batch ${batchId}:`,
        err,
      );
    }

    return completedJob;
  }
}
