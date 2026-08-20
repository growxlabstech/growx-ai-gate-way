import type { BatchRepository } from "../infrastructure/batch-repository.js";
import { BatchFinalizer } from "./batch-finalizer.js";

export class BatchReconciler {
  private readonly repo: BatchRepository;
  private readonly finalizer: BatchFinalizer;

  constructor(deps: { batchRepository: BatchRepository; finalizer: BatchFinalizer }) {
    this.repo = deps.batchRepository;
    this.finalizer = deps.finalizer;
  }

  /**
   * Reconcile stuck leases, counter drift, and unfinalized jobs.
   */
  public async reconcile(): Promise<{ recoveredLeases: number; reconciledJobs: number }> {
    const now = new Date();
    let recoveredLeases = 0;
    let reconciledJobs = 0;

    // 1. Recover expired leases
    const expiredLeases = await this.repo.findExpiredLeases(now);
    for (const lease of expiredLeases) {
      if (lease.resourceType === "batch_item") {
        const item = await this.repo.getBatchItemById(lease.resourceId);
        if (item && item.status === "running") {
          // Re-queue item
          await this.repo.updateBatchItem({
            ...item,
            status: "queued",
          });
        }
      }
      await this.repo.releaseLease(lease.resourceType, lease.resourceId, lease.leaseOwner);
      recoveredLeases++;
    }

    // 2. Check active jobs for counter reconciliation
    const activeJobs = await this.repo.findRunnableBatchJobs(50);
    for (const job of activeJobs) {
      const items = await this.repo.getAllBatchItems(job.id);
      const succeeded = items.filter(i => i.status === "succeeded").length;
      const failed = items.filter(i => i.status === "failed").length;
      const cancelled = items.filter(i => i.status === "cancelled").length;
      const running = items.filter(i => i.status === "running").length;
      const pending = items.filter(i => i.status === "pending" || i.status === "queued" || i.status === "retry_wait").length;

      if (
        job.succeededItems !== succeeded ||
        job.failedItems !== failed ||
        job.cancelledItems !== cancelled ||
        job.runningItems !== running ||
        job.pendingItems !== pending
      ) {
        await this.repo.updateBatchJob({
          ...job,
          succeededItems: succeeded,
          failedItems: failed,
          cancelledItems: cancelled,
          runningItems: running,
          pendingItems: pending,
        });
        reconciledJobs++;
      }
    }

    return { recoveredLeases, reconciledJobs };
  }
}
