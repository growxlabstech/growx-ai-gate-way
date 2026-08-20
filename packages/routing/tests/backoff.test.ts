import { describe, expect, it } from "vitest";
import { calculateBackoffDelay, cancellableSleep } from "../src/backoff.js";
import { DEFAULT_RETRY_POLICY } from "../src/resilience-types.js";

describe("Backoff and Jitter Calculation", () => {
  it("calculates exponential backoff with full jitter", () => {
    // With full jitter and fixed random = 0.5:
    // Attempt 1: 100 * 2^0 = 100 -> 100 * 0.5 = 50ms
    const delay1 = calculateBackoffDelay({
      attemptNumber: 1,
      policy: DEFAULT_RETRY_POLICY,
      randomFn: () => 0.5,
    });
    expect(delay1).toBe(50);

    // Attempt 2: 100 * 2^1 = 200 -> 200 * 0.5 = 100ms
    const delay2 = calculateBackoffDelay({
      attemptNumber: 2,
      policy: DEFAULT_RETRY_POLICY,
      randomFn: () => 0.5,
    });
    expect(delay2).toBe(100);

    // Attempt 3: 100 * 2^2 = 400 -> 400 * 0.5 = 200ms
    const delay3 = calculateBackoffDelay({
      attemptNumber: 3,
      policy: DEFAULT_RETRY_POLICY,
      randomFn: () => 0.5,
    });
    expect(delay3).toBe(200);
  });

  it("respects maxBackoffMs cap", () => {
    const delay = calculateBackoffDelay({
      attemptNumber: 10, // 100 * 2^9 = 51200ms
      policy: { ...DEFAULT_RETRY_POLICY, maxBackoffMs: 1500 },
      randomFn: () => 1.0,
    });
    expect(delay).toBe(1500);
  });

  it("respects Retry-After header while capping at maxBackoffMs", () => {
    const delay = calculateBackoffDelay({
      attemptNumber: 1,
      policy: { ...DEFAULT_RETRY_POLICY, maxBackoffMs: 2000 },
      suggestedDelayMs: 1200,
    });
    expect(delay).toBe(1200);

    const cappedDelay = calculateBackoffDelay({
      attemptNumber: 1,
      policy: { ...DEFAULT_RETRY_POLICY, maxBackoffMs: 2000 },
      suggestedDelayMs: 60000,
    });
    expect(cappedDelay).toBe(2000);
  });

  it("clamps delay within remaining request deadline", () => {
    // 800ms remaining - 500ms min buffer = 300ms max allowed delay
    const delay = calculateBackoffDelay({
      attemptNumber: 3,
      policy: DEFAULT_RETRY_POLICY,
      remainingDeadlineMs: 800,
      randomFn: () => 1.0,
    });
    expect(delay).toBe(300);
  });

  it("cancellableSleep aborts immediately when signal is triggered", async () => {
    const controller = new AbortController();
    const sleepPromise = cancellableSleep(5000, controller.signal);

    controller.abort();
    await expect(sleepPromise).rejects.toThrow("Operation cancelled");
  });
});
