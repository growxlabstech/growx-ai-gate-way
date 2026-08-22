import { randomUUID } from "node:crypto";
import type {
  CreateBatchRequest,
  BatchJob,
  BatchListQuery,
  BatchListResponse,
  BatchItem,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { FileService } from "@growx/storage-service";
import type { CreditService } from "@growx/credit-service";
import type { AuditService } from "@growx/audit-service";
import type { BatchRepository } from "../infrastructure/batch-repository.js";
import type {
  BatchJobRecord,
  BatchItemRecord,
  BatchExecutionReservationRecord,
} from "../domain/types.js";
import {
  BatchNotFoundError,
  BatchValidationError,
  BatchCancellationError,
} from "../domain/types.js";
import { StreamingJsonlParser } from "../domain/jsonl-parser.js";
import { computeBatchRequestHash } from "../domain/idempotency.js";
import { BatchFinalizer } from "./batch-finalizer.js";

export interface BatchServiceDependencies {
  batchRepository: BatchRepository;
  fileService?: FileService;
  creditService?: CreditService;
  auditService?: AuditService;
  webhookService?: any;
  notificationService?: any;
  finalizer?: BatchFinalizer;
}

export class BatchService {
  private readonly repo: BatchRepository;
  private readonly fileService?: FileService;
  private readonly creditService?: CreditService;
  private readonly auditService?: AuditService;
  private readonly webhookService?: any;
  private readonly notificationService?: any;
  private readonly finalizer: BatchFinalizer;
  private readonly parser: StreamingJsonlParser;

  constructor(deps: BatchServiceDependencies) {
    this.repo = deps.batchRepository;
    this.fileService = deps.fileService;
    this.creditService = deps.creditService;
    this.auditService = deps.auditService;
    this.webhookService = deps.webhookService;
    this.notificationService = deps.notificationService;
    this.finalizer = deps.finalizer ?? new BatchFinalizer(deps);
    this.parser = new StreamingJsonlParser();
  }

  /**
   * Submit a new batch execution job
   */
  public async createBatch(
    auth: MachineAuthContext,
    request: CreateBatchRequest,
    idempotencyKey?: string,
  ): Promise<BatchJob> {
    const orgId = auth.organizationId;
    const wsId = auth.workspaceId;

    // Check scope
    if (
      !auth.permissions.includes("batches.create" as any) &&
      !auth.permissions.includes("apiKey.create" as any)
    ) {
      throw new BatchValidationError(
        "Missing required permission 'batches.create'",
      );
    }

    // Handle Idempotency
    if (idempotencyKey) {
      const existing = await this.repo.findIdempotencyRecord(
        orgId,
        idempotencyKey,
      );
      if (existing) {
        const existingJob = await this.repo.getBatchJob(
          orgId,
          existing.batchId,
        );
        if (existingJob) {
          return this.toContractJob(existingJob);
        }
      }
    }

    let parsedItems: { custom_id: string; body: any }[] = [];

    // Source 1: Direct item array
    if (request.items && request.items.length > 0) {
      parsedItems = request.items;
    } else if (request.input_file_id) {
      // Source 2: JSONL file in Phase-25 storage
      if (!this.fileService) {
        throw new BatchValidationError(
          "File service not configured for input file processing",
        );
      }
      const tenant = {
        organizationId: orgId,
        workspaceId: wsId,
        userId: auth.createdBy,
      };
      const fileRecord = await this.fileService.getFile(
        tenant,
        request.input_file_id,
      );
      if (!fileRecord) {
        throw new BatchValidationError(
          `Input file ${request.input_file_id} not found`,
        );
      }
      if (fileRecord.purpose !== "batch_input") {
        throw new BatchValidationError(
          `Input file ${request.input_file_id} must have purpose 'batch_input' (got '${fileRecord.purpose}')`,
        );
      }
      if (fileRecord.status !== "ready") {
        throw new BatchValidationError(
          `Input file ${request.input_file_id} is not ready (status: '${fileRecord.status}')`,
        );
      }

      const streamRes = await this.fileService.getFileContentStream(
        tenant,
        request.input_file_id,
      );
      let fileBuffer: Buffer;
      if (Buffer.isBuffer(streamRes.body)) {
        fileBuffer = streamRes.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of streamRes.body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        fileBuffer = Buffer.concat(chunks);
      }

      const parsed = this.parser.parse(fileBuffer);
      parsedItems = parsed.items;
    } else {
      throw new BatchValidationError(
        "Either input_file_id or items array must be provided",
      );
    }

    if (parsedItems.length === 0) {
      throw new BatchValidationError(
        "Batch input must contain at least 1 item",
      );
    }

    const batchId = `batch_${randomUUID().replace(/-/g, "")}`;
    const now = new Date();

    // Calculate deadline from completion window
    const windowHours =
      request.completion_window === "1h"
        ? 1
        : request.completion_window === "6h"
          ? 6
          : 24;
    const deadlineAt = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

    // Reserve estimated wallet credits if creditService is present
    let reservation: BatchExecutionReservationRecord | undefined;
    if (this.creditService) {
      const estimatedCreditsPerItem = "0.01";
      const totalEstimatedCredits = (
        Number(estimatedCreditsPerItem) * parsedItems.length
      ).toFixed(6);

      reservation = {
        id: `ber_${randomUUID().replace(/-/g, "")}`,
        batchId,
        organizationId: orgId,
        reservedCreditsAmount: totalEstimatedCredits,
        settledCreditsAmount: "0",
        status: "reserved",
        createdAt: now,
      };
    }

    const jobRecord: BatchJobRecord = {
      id: batchId,
      organizationId: orgId,
      workspaceId: wsId,
      createdByUserId: auth.createdBy,
      createdByApiKeyId: auth.apiKeyId,
      inputFileId: request.input_file_id ?? null,
      outputFileId: null,
      errorFileId: null,
      endpoint: request.endpoint ?? "/v1/chat/completions",
      status: "queued",
      completionWindow: request.completion_window ?? "24h",
      metadata: request.metadata ?? {},
      totalItems: parsedItems.length,
      pendingItems: parsedItems.length,
      runningItems: 0,
      succeededItems: 0,
      failedItems: 0,
      cancelledItems: 0,
      executionDeadlineAt: deadlineAt,
      validatedAt: now,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7-day retention
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.createBatchJob(jobRecord, reservation);

    // Create item records
    const itemRecords: BatchItemRecord[] = parsedItems.map((item, index) => ({
      id: `bitem_${randomUUID().replace(/-/g, "")}`,
      batchId,
      organizationId: orgId,
      customId: item.custom_id,
      position: index,
      requestPayload: item.body,
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    }));

    await this.repo.createBatchItems(itemRecords);

    // Save idempotency record
    if (idempotencyKey) {
      await this.repo.createIdempotencyRecord({
        id: `idem_${randomUUID().replace(/-/g, "")}`,
        organizationId: orgId,
        idempotencyKey,
        requestHash: computeBatchRequestHash({
          organizationId: orgId,
          workspaceId: wsId,
          endpoint: jobRecord.endpoint,
          completionWindow: jobRecord.completionWindow,
          inputFileId: jobRecord.inputFileId,
          metadata: jobRecord.metadata,
        }),
        batchId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    // Audit log
    if (this.auditService) {
      await (this.auditService as any).recordEvent?.({
        action: "batch.created",
        organizationId: orgId,
        workspaceId: wsId,
        actorId: auth.apiKeyId,
        metadata: {
          batchId,
          totalItems: parsedItems.length,
          endpoint: jobRecord.endpoint,
        },
      });
    }

    return this.toContractJob(jobRecord);
  }

  /**
   * Retrieve a batch job by ID
   */
  public async getBatch(
    auth: MachineAuthContext,
    id: string,
  ): Promise<BatchJob> {
    const job = await this.repo.getBatchJob(auth.organizationId, id);
    if (!job) {
      throw new BatchNotFoundError(id);
    }
    return this.toContractJob(job);
  }

  /**
   * List batch jobs with cursor pagination
   */
  public async listBatches(
    auth: MachineAuthContext,
    query: BatchListQuery,
  ): Promise<BatchListResponse> {
    const result = await this.repo.listBatchJobs(auth.organizationId, query);
    return {
      data: result.data.map((j) => this.toContractJob(j)),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * Cancel an in-flight or queued batch job
   */
  public async cancelBatch(
    auth: MachineAuthContext,
    id: string,
  ): Promise<BatchJob> {
    const job = await this.repo.getBatchJob(auth.organizationId, id);
    if (!job) {
      throw new BatchNotFoundError(id);
    }

    const terminalStates = [
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
      "expired",
    ];
    if (terminalStates.includes(job.status)) {
      return this.toContractJob(job);
    }

    const updated = await this.repo.updateBatchJobStatus(id, "cancelling", {
      cancelledAt: new Date(),
    });

    // Mark all non-terminal items as cancelled
    const items = await this.repo.getAllBatchItems(id);
    for (const item of items) {
      if (
        item.status !== "succeeded" &&
        item.status !== "failed" &&
        item.status !== "cancelled"
      ) {
        await this.repo.updateBatchItem({
          ...item,
          status: "cancelled",
          completedAt: new Date(),
        });
      }
    }

    // Finalize cancelled batch
    const finalized = await this.finalizer.finalizeBatch(id);

    if (this.auditService) {
      await (this.auditService as any).recordEvent?.({
        action: "batch.cancelled",
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        actorId: auth.apiKeyId,
        metadata: { batchId: id },
      });
    }

    return this.toContractJob(finalized ?? updated);
  }

  /**
   * List individual batch items
   */
  public async listBatchItems(
    auth: MachineAuthContext,
    batchId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{
    data: BatchItem[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const job = await this.repo.getBatchJob(auth.organizationId, batchId);
    if (!job) {
      throw new BatchNotFoundError(batchId);
    }

    const result = await this.repo.listBatchItems(
      auth.organizationId,
      batchId,
      limit,
      cursor,
    );
    return {
      data: result.data.map((i) => ({
        id: i.id,
        batchId: i.batchId,
        organizationId: i.organizationId,
        customId: i.customId,
        position: i.position,
        status: i.status,
        attemptCount: i.attemptCount,
        maxAttempts: i.maxAttempts,
        gatewayRequestId: i.gatewayRequestId,
        responseReference: i.responseReference,
        errorCode: i.errorCode,
        errorMessage: i.errorMessage,
        errorCategory: i.errorCategory,
        startedAt: i.startedAt,
        completedAt: i.completedAt,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  private toContractJob(rec: BatchJobRecord): BatchJob {
    return {
      id: rec.id,
      organizationId: rec.organizationId,
      workspaceId: rec.workspaceId,
      createdByUserId: rec.createdByUserId,
      createdByApiKeyId: rec.createdByApiKeyId,
      inputFileId: rec.inputFileId,
      outputFileId: rec.outputFileId,
      errorFileId: rec.errorFileId,
      endpoint: rec.endpoint,
      status: rec.status,
      completionWindow: rec.completionWindow,
      metadata: rec.metadata,
      totalItems: rec.totalItems,
      pendingItems: rec.pendingItems,
      runningItems: rec.runningItems,
      succeededItems: rec.succeededItems,
      failedItems: rec.failedItems,
      cancelledItems: rec.cancelledItems,
      executionDeadlineAt: rec.executionDeadlineAt,
      validatedAt: rec.validatedAt,
      queuedAt: rec.queuedAt,
      startedAt: rec.startedAt,
      completedAt: rec.completedAt,
      cancelledAt: rec.cancelledAt,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
  }
}
