import { type ProviderOperationStatus } from "@growx/contracts";
import { InvalidStateTransitionError } from "./types.js";

export const TERMINAL_STATUSES: readonly ProviderOperationStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "expired",
];

const VALID_TRANSITIONS: Record<ProviderOperationStatus, readonly ProviderOperationStatus[]> = {
  created: ["submitted", "failed", "cancelled"],
  submitted: ["queued", "running", "finalizing", "completed", "failed", "cancelled", "expired", "unknown"],
  queued: ["running", "finalizing", "completed", "failed", "cancelling", "cancelled", "expired", "unknown"],
  running: ["finalizing", "completed", "failed", "cancelling", "cancelled", "expired", "unknown"],
  cancelling: ["cancelled", "failed", "completed"],
  finalizing: ["completed", "failed"],
  unknown: ["queued", "running", "finalizing", "completed", "failed", "cancelled", "expired"],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export class ProviderOperationStateMachine {
  public static isTerminal(status: ProviderOperationStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  public static canTransition(from: ProviderOperationStatus, to: ProviderOperationStatus): boolean {
    if (from === to) return true;
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static assertCanTransition(from: ProviderOperationStatus, to: ProviderOperationStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }
}
