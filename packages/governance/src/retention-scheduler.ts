import type { IGovernanceRepository } from "./repository.js";
import type { GovernanceDeletionOrchestrator } from "./deletion-orchestrator.js";
import { generateId } from "@growx/ids";

export class RetentionScheduler {
  constructor(
    private repository: IGovernanceRepository,
    private orchestrator?: GovernanceDeletionOrchestrator
  ) {}

  public async scanAndPurgeExpired(limit: number = 100): Promise<number> {
    const expiredResources = await this.repository.findExpiredResources({
      before: new Date(),
      limit,
    });

    let scheduled = 0;
    for (const res of expiredResources) {
      const requestId = generateId("dreq");
      await this.repository.createDeletionRequest({
        id: requestId,
        organizationId: res.organizationId || "org_system",
        workspaceId: res.workspaceId,
        requestedBy: "retention_scheduler",
        scope: "resource",
        scopeTargetId: res.resourceId,
        category: res.dataCategory,
        status: "QUEUED",
        createdAt: new Date(),
      });

      if (this.orchestrator) {
        await this.orchestrator.executeDeletion(requestId).catch(() => {});
      }

      await this.repository.markResourceDeleted(res.id);
      scheduled++;
    }

    return scheduled;
  }
}
