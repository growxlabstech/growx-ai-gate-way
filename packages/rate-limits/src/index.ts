export * from "./types.js";
export * from "./token-estimator.js";
export * from "./counter-store.js";
export * from "./redis-counter-store.js";
export * from "./quota-policy-store.js";
export * from "./capacity-signal-provider.js";
export * from "./quota-engine.js";

// Legacy rate-limit exports for backward compatibility
export type LimitWindow = "minute" | "hour" | "day";
export interface RateLimit {
  dimension:
    | "platform"
    | "plan"
    | "organization"
    | "workspace"
    | "apiKey"
    | "ip"
    | "endpoint";
  window: LimitWindow;
  limit: number;
}
export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number | undefined;
}
const windows: Record<LimitWindow, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
};

export function strictestLimit(
  policies: readonly RateLimit[],
  window: LimitWindow,
): RateLimit | undefined {
  return policies
    .filter((p) => p.window === window && p.limit > 0)
    .reduce<RateLimit | undefined>(
      (best, value) => (!best || value.limit < best.limit ? value : best),
      undefined,
    );
}

export function evaluateFixedWindow(
  count: number,
  policy: RateLimit,
  now = new Date(),
): RateLimitDecision {
  const seconds = windows[policy.window];
  const epoch = Math.floor(now.getTime() / 1000);
  const reset = (Math.floor(epoch / seconds) + 1) * seconds;
  const allowed = count < policy.limit;
  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count - (allowed ? 1 : 0)),
    resetAt: new Date(reset * 1000),
    ...(allowed ? {} : { retryAfterSeconds: Math.max(1, reset - epoch) }),
  };
}

export interface ConcurrencyLease {
  release(): Promise<void>;
}

export interface ConcurrencyStore {
  acquire(
    key: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<ConcurrencyLease | null>;
}
