import type { BatchJobStatus, BatchItemStatus } from "./types.js";
import { BatchConcurrencyError } from "./types.js";

const VALID_JOB_TRANSITIONS: Record<BatchJobStatus, readonly BatchJobStatus[]> =
  {
    validating: ["queued", "failed"],
    queued: ["running", "cancelling", "expired", "failed"],
    running: ["finalizing", "cancelling", "expired", "failed"],
    cancelling: ["cancelled", "finalizing"],
    finalizing: ["completed", "partially_completed", "failed", "cancelled"],
    completed: [],
    partially_completed: [],
    failed: [],
    cancelled: [],
    expired: [],
  };

const TERMINAL_JOB_STATES: ReadonlySet<BatchJobStatus> = new Set([
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
  "expired",
]);

export function isValidJobTransition(
  from: BatchJobStatus,
  to: BatchJobStatus,
): boolean {
  if (from === to) return true;
  const allowed = VALID_JOB_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidJobTransition(
  from: BatchJobStatus,
  to: BatchJobStatus,
  batchId: string,
): void {
  if (!isValidJobTransition(from, to)) {
    throw new BatchConcurrencyError(
      `Illegal batch job state transition for batch ${batchId}: cannot transition from '${from}' to '${to}'`,
    );
  }
}

export function isTerminalJobStatus(status: BatchJobStatus): boolean {
  return TERMINAL_JOB_STATES.has(status);
}

const VALID_ITEM_TRANSITIONS: Record<
  BatchItemStatus,
  readonly BatchItemStatus[]
> = {
  pending: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "retry_wait", "cancelled", "queued"],
  retry_wait: ["queued", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const TERMINAL_ITEM_STATES: ReadonlySet<BatchItemStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isValidItemTransition(
  from: BatchItemStatus,
  to: BatchItemStatus,
): boolean {
  if (from === to) return true;
  const allowed = VALID_ITEM_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidItemTransition(
  from: BatchItemStatus,
  to: BatchItemStatus,
  itemId: string,
): void {
  if (!isValidItemTransition(from, to)) {
    throw new BatchConcurrencyError(
      `Illegal batch item state transition for item ${itemId}: cannot transition from '${from}' to '${to}'`,
    );
  }
}

export function isTerminalItemStatus(status: BatchItemStatus): boolean {
  return TERMINAL_ITEM_STATES.has(status);
}
