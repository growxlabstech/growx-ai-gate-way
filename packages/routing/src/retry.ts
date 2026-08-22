export interface RetryPolicy {
  maximumAttempts: number;
  maximumDurationMs: number;
  initialDelayMs: number;
  maximumDelayMs: number;
  jitterRatio: number;
  retryableCodes: ReadonlySet<string>;
}
export class RetryBudget {
  private attempts = 0;
  private readonly startedAt = Date.now();
  constructor(
    private readonly policy: RetryPolicy,
    private readonly random: () => number = Math.random,
  ) {}
  mayRetry(code: string, now = Date.now()): boolean {
    return (
      this.attempts < this.policy.maximumAttempts &&
      now - this.startedAt < this.policy.maximumDurationMs &&
      this.policy.retryableCodes.has(code)
    );
  }
  nextDelay(retryAfterMs?: number): number {
    const exponential = Math.min(
      this.policy.maximumDelayMs,
      this.policy.initialDelayMs * 2 ** this.attempts++,
    );
    const jitter =
      exponential * this.policy.jitterRatio * (this.random() * 2 - 1);
    const value = Math.max(0, Math.round(exponential + jitter));
    return retryAfterMs === undefined
      ? value
      : Math.min(
          retryAfterMs,
          Math.max(
            0,
            this.policy.maximumDurationMs - (Date.now() - this.startedAt),
          ),
        );
  }
}
export function retryableProviderCode(code: string): boolean {
  return new Set([
    "provider_rate_limit",
    "provider_timeout",
    "provider_unavailable",
    "provider_server_error",
    "gateway_timeout",
  ]).has(code);
}
