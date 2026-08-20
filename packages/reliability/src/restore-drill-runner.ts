import type { RecoveryRun, RecoveryRunType } from "@growx/contracts";
import { generateId } from "@growx/ids";
import { CriticalInvariantVerifier, type PlatformStateSnapshot } from "./invariant-verifier.js";

export class RestoreDrillRunner {
  private verifier = new CriticalInvariantVerifier();
  private runs = new Map<string, RecoveryRun>();

  public async executeDrill(options: {
    type: RecoveryRunType;
    scope: string;
    operatorId: string;
    stateSnapshot: PlatformStateSnapshot;
    simulatedDurationMs?: number;
    simulatedRpoSeconds?: number;
  }): Promise<RecoveryRun> {
    const runId = generateId("rcv");
    const startedAt = new Date();

    const invariantResults = this.verifier.verifyAll(options.stateSnapshot);
    const hasFailures = invariantResults.some((r) => r.status === "failed");

    const rtoSeconds = (options.simulatedDurationMs ?? 2500) / 1000;
    const rpoSeconds = options.simulatedRpoSeconds ?? 0;

    const run: RecoveryRun = {
      id: runId,
      type: options.type,
      scope: options.scope,
      status: hasFailures ? "failed" : "passed",
      startedBy: options.operatorId,
      startedAt,
      completedAt: new Date(startedAt.getTime() + (options.simulatedDurationMs ?? 2500)),
      observedRpoSeconds: rpoSeconds,
      observedRtoSeconds: rtoSeconds,
      evidenceSummary: hasFailures
        ? "Drill completed with critical invariant verification errors."
        : "Drill completed successfully in isolated sandbox. All critical invariants verified.",
      invariants: invariantResults,
    };

    this.runs.set(runId, run);
    return run;
  }

  public getRun(id: string): RecoveryRun | undefined {
    return this.runs.get(id);
  }

  public listRuns(): RecoveryRun[] {
    return Array.from(this.runs.values());
  }
}
