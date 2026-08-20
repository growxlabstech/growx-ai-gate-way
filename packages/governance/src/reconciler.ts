import type { IGovernanceRepository } from "./repository.js";
import type { GovernanceDeletionOrchestrator } from "./deletion-orchestrator.js";

export class GovernanceReconciler {
  constructor(
    private repository: IGovernanceRepository,
    private orchestrator?: GovernanceDeletionOrchestrator
  ) {}

  public async reconcileStuckDeletions(stuckThresholdMs: number = 300_000): Promise<number> {
    const allRequests = await this.repository.listDeletionRequests();
    const stuckBefore = new Date(Date.now() - stuckThresholdMs);

    let reconciled = 0;
    for (const req of allRequests) {
      if ((req.status === "RUNNING" || req.status === "QUEUED") && req.createdAt <= stuckBefore) {
        if (this.orchestrator) {
          await this.orchestrator.executeDeletion(req.id).catch(() => {});
          reconciled++;
        }
      }
    }

    return reconciled;
  }
}
