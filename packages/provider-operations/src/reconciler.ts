import type { IProviderOperationRepository } from "./repository.js";
import type { ProviderOperationFinalizer } from "./finalizer.js";

export class ProviderOperationReconciler {
  constructor(
    private repository: IProviderOperationRepository,
    private finalizer?: ProviderOperationFinalizer,
  ) {}

  public async reconcileStuckOperations(
    stuckThresholdMs: number = 300_000,
  ): Promise<number> {
    const stuckBefore = new Date(Date.now() - stuckThresholdMs);
    const stuck = await this.repository.findStuckOperations({
      statuses: ["submitted", "running", "finalizing", "queued"],
      stuckBefore,
      limit: 50,
    });

    let reconciled = 0;
    for (const op of stuck) {
      if (op.status === "finalizing" && this.finalizer) {
        // Retry stalled finalization without resubmitting provider job
        await this.finalizer.finalize(op.id).catch(() => {});
        reconciled++;
      } else if (
        op.leaseOwner &&
        op.leaseExpiresAt &&
        op.leaseExpiresAt < new Date()
      ) {
        // Expired lease recovery
        await this.repository.update(op.id, {
          leaseOwner: null,
          leaseExpiresAt: null,
          nextPollAt: new Date(),
        });
        reconciled++;
      }
    }

    return reconciled;
  }
}
