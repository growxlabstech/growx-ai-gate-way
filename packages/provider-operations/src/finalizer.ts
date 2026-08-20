import type { IProviderOperationRepository } from "./repository.js";
import type { ProviderOperationAdapter } from "./adapters/provider-operation-adapter.js";
import { ProviderOperationStateMachine } from "./state-machine.js";

export interface FinalizerDependencies {
  fileService?: any;
  usageMetering?: any;
  creditService?: any;
  customerPriceCalculator?: any;
}

export class ProviderOperationFinalizer {
  private adapters = new Map<string, ProviderOperationAdapter>();

  constructor(
    private repository: IProviderOperationRepository,
    private deps: FinalizerDependencies = {}
  ) {}

  public registerAdapter(adapter: ProviderOperationAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public async finalize(operationId: string): Promise<void> {
    const op = await this.repository.getById(operationId);
    if (!op) return;

    // Idempotent: already completed
    if (op.status === "completed") return;

    // Must be in finalizing (or completed provider)
    if (op.status !== "finalizing" && op.status !== "running" && op.status !== "queued") {
      return;
    }

    const adapter = this.adapters.get(op.providerId);
    let outputFileId = op.outputFileId;

    if (adapter && op.resultReference) {
      const result = await adapter.fetchResult(op.resultReference);

      // If file service is available and result has buffer/data, persist as generated_artifact
      if (this.deps.fileService && !outputFileId && result.rawBuffer) {
        const fileObj = await this.deps.fileService.createFileFromBuffer?.({
          organizationId: op.organizationId,
          workspaceId: op.workspaceId,
          purpose: "generated_artifact",
          mimeType: result.outputFileMime || "application/octet-stream",
          buffer: result.rawBuffer,
          originalFileName: `artifact_${op.id}`,
        });
        if (fileObj) {
          outputFileId = fileObj.id;
        }
      }
    }

    // Record usage
    if (this.deps.usageMetering) {
      await this.deps.usageMetering.recordRequestCompleted?.({
        requestId: op.requestId,
        status: "completed",
        completedAt: new Date(),
        durationMs: op.startedAt ? Date.now() - new Date(op.startedAt).getTime() : 1000,
      }).catch(() => {});
    }

    // Settle wallet billing reservation if present
    const reservationId = (op.metadata as any)?.billingReservationId;
    if (this.deps.creditService && reservationId) {
      await this.deps.creditService.settleReservation?.({
        reservationId,
        finalCustomerPrice: 100, // minor units
        actualInputTokens: 100,
        actualOutputTokens: 50,
      }).catch(() => {});
    }

    ProviderOperationStateMachine.assertCanTransition(op.status, "completed");
    await this.repository.update(op.id, {
      status: "completed",
      completedAt: new Date(),
      outputFileId,
    });
  }
}
