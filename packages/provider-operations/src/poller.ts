import type { IProviderOperationRepository } from "./repository.js";
import type { ProviderOperationAdapter } from "./adapters/provider-operation-adapter.js";
import { ProviderOperationStateMachine } from "./state-machine.js";

export interface PollerOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
  jitterFactor?: number;
}

export class ProviderOperationPoller {
  private adapters = new Map<string, ProviderOperationAdapter>();

  constructor(
    private repository: IProviderOperationRepository,
    private options: PollerOptions = {}
  ) {}

  public registerAdapter(adapter: ProviderOperationAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public calculateNextPoll(attemptCount: number, retryAfterSeconds?: number): Date {
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      return new Date(Date.now() + retryAfterSeconds * 1000);
    }

    const baseMs = this.options.baseIntervalMs || 2000;
    const maxMs = this.options.maxIntervalMs || 60000;
    const jitterFactor = this.options.jitterFactor || 0.2;

    // Exponential backoff
    const expMs = Math.min(baseMs * Math.pow(1.5, Math.min(attemptCount, 8)), maxMs);
    const jitter = expMs * jitterFactor * (Math.random() * 2 - 1);
    const totalDelayMs = Math.max(1000, Math.round(expMs + jitter));

    return new Date(Date.now() + totalDelayMs);
  }

  public async pollDueOperations(workerId: string): Promise<number> {
    const dueOperations = await this.repository.claimDueForPolling({
      dueBefore: new Date(),
      limit: this.options.batchSize || 20,
      leaseOwner: workerId,
      leaseDurationMs: this.options.leaseDurationMs || 30000,
    });

    for (const op of dueOperations) {
      try {
        const adapter = this.adapters.get(op.providerId);
        if (!adapter) {
          await this.repository.update(op.id, {
            status: "failed",
            errorCode: "ADAPTER_NOT_FOUND",
            errorMessage: `No operation adapter registered for provider '${op.providerId}'`,
            failedAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
          });
          continue;
        }

        const statusRes = await adapter.getOperationStatus(op.providerOperationId);
        const nextAttempt = op.attemptCount + 1;

        if (statusRes.status === "completed") {
          // Move to finalizing so finalizer can import artifacts & settle billing
          ProviderOperationStateMachine.assertCanTransition(op.status, "finalizing");
          await this.repository.update(op.id, {
            status: "finalizing",
            resultReference: statusRes.resultReference || op.resultReference,
            attemptCount: nextAttempt,
            leaseOwner: null,
            leaseExpiresAt: null,
          });
        } else if (statusRes.status === "failed") {
          await this.repository.update(op.id, {
            status: "failed",
            errorCode: statusRes.errorCode || "PROVIDER_FAILED",
            errorMessage: statusRes.errorMessage,
            failedAt: new Date(),
            attemptCount: nextAttempt,
            leaseOwner: null,
            leaseExpiresAt: null,
          });
        } else {
          // Still running/queued -> schedule next poll
          const nextPollAt = this.calculateNextPoll(nextAttempt);
          await this.repository.update(op.id, {
            status: statusRes.status,
            attemptCount: nextAttempt,
            nextPollAt,
            leaseOwner: null,
            leaseExpiresAt: null,
          });
        }
      } catch (err: any) {
        // Transient poll error -> schedule retry without marking job failed
        const nextPollAt = this.calculateNextPoll(op.attemptCount + 1);
        await this.repository.releaseLease(op.id, workerId, nextPollAt);
      }
    }

    return dueOperations.length;
  }
}
