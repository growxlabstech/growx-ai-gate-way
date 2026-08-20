/**
 * Stream State Machine for the GrowX AI Gateway.
 *
 * States flow:
 *   INITIAL → VALIDATED → CONNECTING → STREAMING → COMPLETING → COMPLETED
 *                                                              → FAILED
 *                                                              → CANCELLED
 *                                                              → TIMED_OUT
 *
 * Terminal states: COMPLETED, FAILED, CANCELLED, TIMED_OUT
 * Once a terminal state is reached, no further transitions are allowed.
 */

export enum StreamState {
  /** Request received, not yet validated */
  INITIAL = "INITIAL",
  /** Auth, model resolution, and route resolution passed */
  VALIDATED = "VALIDATED",
  /** Connecting to provider adapter */
  CONNECTING = "CONNECTING",
  /** Actively receiving chunks from provider */
  STREAMING = "STREAMING",
  /** Provider stream ended, finalizing (usage, DB, events) */
  COMPLETING = "COMPLETING",
  /** Successfully completed with all records persisted */
  COMPLETED = "COMPLETED",
  /** Stream failed due to provider or gateway error */
  FAILED = "FAILED",
  /** Client disconnected or explicit cancellation */
  CANCELLED = "CANCELLED",
  /** Deadline or idle timeout exceeded */
  TIMED_OUT = "TIMED_OUT",
}

const TERMINAL_STATES: ReadonlySet<StreamState> = new Set([
  StreamState.COMPLETED,
  StreamState.FAILED,
  StreamState.CANCELLED,
  StreamState.TIMED_OUT,
]);

/**
 * Valid state transitions. Each key maps to the set of states it can
 * transition to. Terminal states have no outgoing transitions.
 */
const VALID_TRANSITIONS: ReadonlyMap<StreamState, ReadonlySet<StreamState>> = new Map([
  [
    StreamState.INITIAL,
    new Set([StreamState.VALIDATED, StreamState.FAILED, StreamState.CANCELLED]),
  ],
  [
    StreamState.VALIDATED,
    new Set([StreamState.CONNECTING, StreamState.FAILED, StreamState.CANCELLED]),
  ],
  [
    StreamState.CONNECTING,
    new Set([
      StreamState.STREAMING,
      StreamState.FAILED,
      StreamState.CANCELLED,
      StreamState.TIMED_OUT,
    ]),
  ],
  [
    StreamState.STREAMING,
    new Set([
      StreamState.COMPLETING,
      StreamState.FAILED,
      StreamState.CANCELLED,
      StreamState.TIMED_OUT,
    ]),
  ],
  [
    StreamState.COMPLETING,
    new Set([StreamState.COMPLETED, StreamState.FAILED]),
  ],
  // Terminal states — no outgoing transitions
  [StreamState.COMPLETED, new Set()],
  [StreamState.FAILED, new Set()],
  [StreamState.CANCELLED, new Set()],
  [StreamState.TIMED_OUT, new Set()],
]);

/** Returns true if the given state is a terminal (final) state. */
export function isTerminal(state: StreamState): boolean {
  return TERMINAL_STATES.has(state);
}

/** Returns true if transitioning from `from` to `to` is a valid transition. */
export function isValidTransition(from: StreamState, to: StreamState): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.has(to);
}

/**
 * Validates and returns the target state if the transition is valid.
 * Throws StreamTransitionError if the transition is invalid.
 */
export function assertTransition(from: StreamState, to: StreamState): StreamState {
  if (!isValidTransition(from, to)) {
    throw new StreamTransitionError(from, to);
  }
  return to;
}

/** Error thrown when an invalid stream state transition is attempted. */
export class StreamTransitionError extends Error {
  public readonly from: StreamState;
  public readonly to: StreamState;

  constructor(from: StreamState, to: StreamState) {
    super(
      `Invalid stream state transition: ${from} → ${to}` +
        (isTerminal(from) ? ` (${from} is a terminal state)` : "")
    );
    this.name = "StreamTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Metrics tracked during a stream's lifecycle. */
export interface StreamMetrics {
  /** Timestamp when the first model output token was emitted to the client */
  firstTokenAt: number | null;
  /** Timestamp of the last chunk received from the provider */
  lastChunkAt: number | null;
  /** Total number of SSE chunks emitted to the client */
  chunksEmitted: number;
  /** Total bytes written to the client response */
  bytesWritten: number;
  /** Whether any model output has been emitted (text delta or tool call delta) */
  hasEmittedModelOutput: boolean;
}

/** Creates a fresh StreamMetrics with all counters at zero. */
export function createStreamMetrics(): StreamMetrics {
  return {
    firstTokenAt: null,
    lastChunkAt: null,
    chunksEmitted: 0,
    bytesWritten: 0,
    hasEmittedModelOutput: false,
  };
}
