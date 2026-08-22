import type { RetryPolicy } from "./resilience-types.js";

export interface CalculateBackoffOptions {
  attemptNumber: number;
  policy: RetryPolicy;
  suggestedDelayMs?: number | undefined;
  remainingDeadlineMs?: number | undefined;
  randomFn?: (() => number) | undefined;
}

/**
 * Calculates backoff delay with jitter, bounded by maxBackoffMs, Retry-After header,
 * and remaining request deadline.
 */
export function calculateBackoffDelay(
  options: CalculateBackoffOptions,
): number {
  const {
    attemptNumber,
    policy,
    suggestedDelayMs,
    remainingDeadlineMs,
    randomFn = Math.random,
  } = options;

  // 1. If Retry-After provided by provider, prioritize it (bounded by policy maxBackoffMs)
  if (suggestedDelayMs !== undefined && suggestedDelayMs > 0) {
    let delay = Math.min(policy.maxBackoffMs, suggestedDelayMs);
    if (remainingDeadlineMs !== undefined) {
      // Leave at least policy.minimumRemainingDeadlineMs for the actual attempt
      const usableTime = Math.max(
        0,
        remainingDeadlineMs - policy.minimumRemainingDeadlineMs,
      );
      delay = Math.min(delay, usableTime);
    }
    return Math.max(0, Math.round(delay));
  }

  // 2. Exponential Backoff base
  const exponent = Math.max(0, attemptNumber - 1);
  const exponentialDelay = Math.min(
    policy.maxBackoffMs,
    policy.baseBackoffMs * 2 ** exponent,
  );

  // 3. Jitter Application
  let delay = exponentialDelay;
  const rand = randomFn();

  switch (policy.jitter) {
    case "full":
      // Full Jitter: Sleep between 0 and exponentialDelay
      delay = rand * exponentialDelay;
      break;

    case "equal":
      // Equal Jitter: Half fixed + half randomized
      const half = exponentialDelay / 2;
      delay = half + rand * half;
      break;

    case "decorrelated":
      // Decorrelated Jitter: Sleep between base and 3 * previous
      delay = Math.min(
        policy.maxBackoffMs,
        policy.baseBackoffMs + rand * exponentialDelay * 2,
      );
      break;

    case "none":
    default:
      delay = exponentialDelay;
      break;
  }

  // 4. Bound by remaining deadline
  if (remainingDeadlineMs !== undefined) {
    const usableTime = Math.max(
      0,
      remainingDeadlineMs - policy.minimumRemainingDeadlineMs,
    );
    delay = Math.min(delay, usableTime);
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Creates a cancellable sleep promise that rejects or resolves early if signal aborts.
 */
export function cancellableSleep(
  ms: number,
  signal?: AbortSignal | undefined,
): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("Operation cancelled during retry delay"));
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Operation cancelled during retry delay"));
    };

    signal?.addEventListener("abort", onAbort);
  });
}
