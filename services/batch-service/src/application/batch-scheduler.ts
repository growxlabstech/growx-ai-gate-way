import type { BatchRepository } from "../infrastructure/batch-repository.js";
import { BatchFinalizer } from "./batch-finalizer.js";
import { isTerminalItemStatus } from "../domain/state-machine.js";

export interface BatchSchedulerOptions {
  fairConcurrencyPerTenant?: number;
  scanIntervalMs?: number;
}

export class BatchScheduler {
  private readonly repo: BatchRepository;
  private readonly finalizer: BatchFinalizer;
  private readonly fairConcurrencyPerTenant: number;

  constructor(
    deps: {
      batchRepository: BatchRepository;
      finalizer: BatchFinalizer;
    },
    options: BatchSchedulerOptions = {}
  ) {
    this.repo = deps.batchRepository;
    this.finalizer = deps.finalizer;
    this.fairConcurrencyPerTenant = options.fairConcurrencyPerTenant ?? 20;
  }

  /**
   * Run one scheduler scan cycle.
   */
  public async step(): Promise<{ activatedCount: number; finalizedCount: number; expiredCount: number }> {
    const now = new Date();
    let activatedCount = 0;
    let finalizedCount = 0;
    let expiredCount = 0;

    // 1. Check expired jobs
    const expiredJobs = await this.repo.findExpiredBatchJobs(now);
    for (const job of expiredJobs) {
      await this.repo.updateBatchJobStatus(job.id, "expired");
      await this.finalizer.finalizeBatch(job.id);
      expiredCount++;
    }

    // 2. Scan runnable jobs
    const runnableJobs = await this.repo.findRunnableBatchJobs(50);
    for (const job of runnableJobs) {
      if (job.status === "queued") {
        await this.repo.updateBatchJobStatus(job.id, "running", { startedAt: now });
        activatedCount++;
      } else if (job.status === "cancelling") {
        // Mark remaining items cancelled
        const items = await this.repo.getAllBatchItems(job.id);
        for (const item of items) {
          if (!isTerminalItemStatus(item.status)) {
            await this.repo.updateBatchItem({
              ...item,
              status: "cancelled",
              completedAt: now,
            });
            await this.repo.updateBatchJobCounters(job.id, { cancelled: 1 });
          }
        }
        await this.finalizer.finalizeBatch(job.id);
        finalizedCount++;
      } else if (job.status === "running") {
        const items = await this.repo.getAllBatchItems(job.id);
        const allDone = items.length === 0 || items.every(i => isTerminalItemStatus(i.status));
        if (allDone) {
          await this.finalizer.finalizeBatch(job.id);
          finalizedCount++;
        }
      }
    }

    return { activatedCount, finalizedCount, expiredCount };
  }
}
