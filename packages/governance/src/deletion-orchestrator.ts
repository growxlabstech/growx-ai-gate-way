import type {
  DeletionRequest,
  DeletionTask,
  DeletionEvidence,
} from "@growx/contracts";
import type { IGovernanceRepository } from "./repository.js";
import type { GovernanceDeletionProcessor } from "./processors/deletion-processor.js";
import { generateId } from "@growx/ids";

export class GovernanceDeletionOrchestrator {
  private processors = new Map<string, GovernanceDeletionProcessor>();

  constructor(private repository: IGovernanceRepository) {}

  public registerProcessor(processor: GovernanceDeletionProcessor): void {
    this.processors.set(processor.processorType, processor);
  }

  public async executeDeletion(requestId: string): Promise<DeletionRequest> {
    const request = await this.repository.getDeletionRequest(requestId);
    if (!request) throw new Error(`DeletionRequest '${requestId}' not found`);

    // Check active holds
    const holds = await this.repository.findActiveHolds({
      organizationId: request.organizationId,
      workspaceId: request.workspaceId || undefined,
      category: request.category,
      resourceId: request.scopeTargetId,
    });

    if (holds.length > 0) {
      return this.repository.updateDeletionRequest(requestId, {
        status: "BLOCKED",
        reason: `Blocked by active retention hold: ${holds[0]!.reasonCode}`,
      });
    }

    await this.repository.updateDeletionRequest(requestId, {
      status: "RUNNING",
      startedAt: new Date(),
    });

    let hasErrors = false;

    for (const processor of this.processors.values()) {
      const discoveredIds = await processor.discover({
        organizationId: request.organizationId,
        workspaceId: request.workspaceId || undefined,
        resourceId: request.scopeTargetId,
      });

      for (const resId of discoveredIds) {
        const taskId = generateId("dtsk");
        const task: DeletionTask = {
          id: taskId,
          deletionRequestId: requestId,
          processor: processor.processorType,
          resourceType: request.category || "content",
          resourceId: resId,
          status: "running",
          attemptCount: 1,
        };
        await this.repository.createDeletionTask(task);

        try {
          // Execute deletion
          await processor.delete(resId, { organizationId: request.organizationId });

          // Verify purge
          const verified = await processor.verify(resId, { organizationId: request.organizationId });

          if (verified) {
            await this.repository.updateDeletionTask(taskId, {
              status: "completed",
              completedAt: new Date(),
            });

            const evidence: DeletionEvidence = {
              id: generateId("devd"),
              taskId,
              deletionRequestId: requestId,
              processor: processor.processorType,
              resourceType: request.category || "content",
              resourceId: resId,
              verificationMethod: "processor_absence_check",
              verifiedAt: new Date(),
              outcome: "PURGED",
            };
            await this.repository.recordEvidence(evidence);
          } else {
            hasErrors = true;
            await this.repository.updateDeletionTask(taskId, {
              status: "failed",
              lastError: "Absence verification failed",
            });
          }
        } catch (err: any) {
          hasErrors = true;
          await this.repository.updateDeletionTask(taskId, {
            status: "failed",
            lastError: err?.message || "Processor execution error",
          });
        }
      }
    }

    const finalStatus = hasErrors ? "PARTIAL" : "COMPLETED";
    return this.repository.updateDeletionRequest(requestId, {
      status: finalStatus,
      completedAt: new Date(),
    });
  }
}
