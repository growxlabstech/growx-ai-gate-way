import type { GatewayEngine } from "@growx/gateway-service";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { BatchRepository } from "../infrastructure/batch-repository.js";
import type { BatchItemRecord, BatchItemAttemptRecord } from "../domain/types.js";
import { BatchFinalizer } from "./batch-finalizer.js";

export interface BatchWorkerOptions {
  workerId: string;
  concurrency?: number;
  leaseDurationMs?: number;
  maxPerTenant?: number;
}

export class BatchWorker {
  private readonly repo: BatchRepository;
  private readonly gatewayEngine: GatewayEngine;
  private readonly finalizer: BatchFinalizer;
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly leaseDurationMs: number;
  private readonly maxPerTenant: number;

  constructor(
    deps: {
      batchRepository: BatchRepository;
      gatewayEngine: GatewayEngine;
      finalizer: BatchFinalizer;
    },
    options: BatchWorkerOptions
  ) {
    this.repo = deps.batchRepository;
    this.gatewayEngine = deps.gatewayEngine;
    this.finalizer = deps.finalizer;
    this.workerId = options.workerId;
    this.concurrency = options.concurrency ?? 10;
    this.leaseDurationMs = options.leaseDurationMs ?? 30000;
    this.maxPerTenant = options.maxPerTenant ?? 5;
  }

  /**
   * Run one iteration of item claiming and execution.
   */
  public async step(): Promise<number> {
    const claimedItems = await this.repo.claimRunnableBatchItemsFair(
      this.workerId,
      this.concurrency,
      this.leaseDurationMs,
      this.maxPerTenant
    );

    if (claimedItems.length === 0) {
      return 0;
    }

    // Process claimed items concurrently
    await Promise.all(claimedItems.map(item => this.processItem(item)));
    return claimedItems.length;
  }

  /**
   * Process a single batch item through canonical GatewayEngine
   */
  public async processItem(item: BatchItemRecord): Promise<void> {
    const job = await this.repo.getBatchJobById(item.batchId);
    if (!job) {
      await this.repo.releaseLease("batch_item", item.id, this.workerId);
      return;
    }

    // If job was cancelled or expired, mark item cancelled
    if (job.status === "cancelling" || job.status === "cancelled" || job.status === "expired") {
      await this.repo.updateBatchItem({
        ...item,
        status: "cancelled",
        completedAt: new Date(),
      });
      await this.repo.updateBatchJobCounters(job.id, { cancelled: 1, running: -1 });
      await this.repo.releaseLease("batch_item", item.id, this.workerId);
      return;
    }

    // Check execution deadline
    const now = new Date();
    if (job.executionDeadlineAt && job.executionDeadlineAt <= now) {
      await this.repo.updateBatchItem({
        ...item,
        status: "failed",
        errorCode: "batch_deadline_exceeded",
        errorMessage: "Batch execution deadline exceeded",
        errorCategory: "timeout",
        completedAt: now,
      });
      await this.repo.updateBatchJobCounters(job.id, { failed: 1, running: -1 });
      await this.repo.releaseLease("batch_item", item.id, this.workerId);
      return;
    }

    const executionId = `ba_${item.id}_${item.attemptCount}`;
    const attemptStart = new Date();

    // Reconstruct canonical MachineAuthContext
    const authContext: MachineAuthContext = {
      actorType: "apiKey",
      apiKeyId: job.createdByApiKeyId ?? `key_batch_${job.organizationId}`,
      organizationId: job.organizationId,
      workspaceId: job.workspaceId,
      environmentId: `env_${job.workspaceId}`,
      environment: "production",
      name: "Batch Execution Principal",
      permissions: ["models.read", "responses.create", "chat.completions.create"],
      modelRules: [],
      ipAllowlist: [],
      rateLimits: [],
      createdBy: job.createdByUserId ?? "system",
      createdAt: job.createdAt,
      expiresAt: null,
      lastUsedAt: now,
    };

    try {
      // Execute through canonical Gateway execution boundary
      const response = await this.gatewayEngine.executeChatCompletion(
        authContext,
        {
          ...item.requestPayload,
          stream: false,
        }
      );

      const latencyMs = Date.now() - attemptStart.getTime();

      // Record successful attempt
      const attempt: BatchItemAttemptRecord = {
        id: executionId,
        batchItemId: item.id,
        batchId: job.id,
        attemptNumber: item.attemptCount,
        executionId,
        gatewayRequestId: response.id,
        status: "succeeded",
        retryable: false,
        latencyMs,
        startedAt: attemptStart,
        completedAt: new Date(),
      };
      await this.repo.recordBatchItemAttempt(attempt);

      // Update item to succeeded
      await this.repo.updateBatchItem({
        ...item,
        status: "succeeded",
        gatewayRequestId: response.id,
        responsePayload: response,
        completedAt: new Date(),
      });

      await this.repo.updateBatchJobCounters(job.id, { succeeded: 1, running: -1 });
    } catch (err: any) {
      const latencyMs = Date.now() - attemptStart.getTime();
      const statusCode = err.statusCode ?? err.status ?? 500;
      const isRetryable = (statusCode === 429 || statusCode >= 500) && item.attemptCount < item.maxAttempts;

      const attempt: BatchItemAttemptRecord = {
        id: executionId,
        batchItemId: item.id,
        batchId: job.id,
        attemptNumber: item.attemptCount,
        executionId,
        status: "failed",
        errorCode: err.code ?? "provider_error",
        errorMessage: err.message ?? "Gateway execution failed",
        retryable: isRetryable,
        latencyMs,
        startedAt: attemptStart,
        completedAt: new Date(),
      };
      await this.repo.recordBatchItemAttempt(attempt);

      if (isRetryable) {
        // Exponential backoff with jitter: 2^attempt * 1000ms + rand(500)
        const backoffMs = Math.pow(2, item.attemptCount) * 1000 + Math.floor(Math.random() * 500);
        await this.repo.updateBatchItem({
          ...item,
          status: "retry_wait",
          errorCode: err.code ?? "transient_error",
          errorMessage: err.message,
          retryAfterAt: new Date(Date.now() + backoffMs),
        });
      } else {
        // Non-retryable or max attempts reached
        await this.repo.updateBatchItem({
          ...item,
          status: "failed",
          errorCode: err.code ?? "execution_failed",
          errorMessage: err.message ?? "Execution failed",
          errorCategory: statusCode === 400 ? "validation_error" : "execution_error",
          completedAt: new Date(),
        });
        await this.repo.updateBatchJobCounters(job.id, { failed: 1, running: -1 });
      }
    } finally {
      await this.repo.releaseLease("batch_item", item.id, this.workerId);
    }
  }
}
