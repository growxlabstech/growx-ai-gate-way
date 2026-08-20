export type RouteHealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

export type CircuitState =
  | "CLOSED"
  | "OPEN"
  | "HALF_OPEN"
  | "FORCED_OPEN"
  | "FORCED_CLOSED";

export interface CircuitConfiguration {
  /**
   * Minimum number of sample attempts in rolling window before failure rate circuit opening is evaluated.
   * Default: 5.
   */
  minimumSampleSize: number;
  /**
   * Infrastructure failure rate (5xx + network + timeouts) threshold to trigger OPEN.
   * Expressed as a ratio (0..1). Default: 0.5 (50%).
   */
  failureRateThreshold: number;
  /**
   * Timeout rate threshold to trigger OPEN or DEGRADED.
   * Expressed as a ratio (0..1). Default: 0.4 (40%).
   */
  timeoutRateThreshold: number;
  /**
   * Rate-limit (429) rate threshold for pressure degradation.
   * Expressed as a ratio (0..1). Default: 0.5 (50%).
   */
  rateLimitRateThreshold: number;
  /**
   * Consecutive qualifying infrastructure failures that trigger immediate OPEN even below minimumSampleSize.
   * Default: 3.
   */
  consecutiveFailureThreshold: number;
  /**
   * Base cooldown duration in milliseconds when circuit enters OPEN.
   * Default: 30,000ms (30s).
   */
  openDurationMs: number;
  /**
   * Maximum cooldown duration when backoff increases on repeated reopenings.
   * Default: 300,000ms (5 minutes).
   */
  maxOpenDurationMs: number;
  /**
   * Maximum concurrent probe/test executions allowed while in HALF_OPEN.
   * Default: 2.
   */
  halfOpenMaxConcurrent: number;
  /**
   * Number of consecutive successful probe executions required in HALF_OPEN to transition back to CLOSED.
   * Default: 2.
   */
  halfOpenRequiredSuccesses: number;
  /**
   * TTL in milliseconds for an execution permit before it automatically expires.
   * Default: 30,000ms (30s).
   */
  permitTtlMs: number;
  /**
   * Error rate threshold to classify route health as 'degraded' (0..1).
   * Default: 0.2 (20%).
   */
  degradedErrorRateThreshold: number;
  /**
   * Latency multiplier vs baseline to classify route health as 'degraded'.
   * Default: 2.0 (2x baseline).
   */
  degradedLatencyMultiplier: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitConfiguration = {
  minimumSampleSize: 5,
  failureRateThreshold: 0.5,
  timeoutRateThreshold: 0.4,
  rateLimitRateThreshold: 0.5,
  consecutiveFailureThreshold: 3,
  openDurationMs: 30_000,
  maxOpenDurationMs: 300_000,
  halfOpenMaxConcurrent: 2,
  halfOpenRequiredSuccesses: 2,
  permitTtlMs: 30_000,
  degradedErrorRateThreshold: 0.2,
  degradedLatencyMultiplier: 2.0,
};

export type HealthOutcomeSignal =
  | "success"
  | "error_5xx"
  | "timeout"
  | "network_error"
  | "rate_limit_429"
  | "auth_failure"
  | "client_cancelled"
  | "bad_request"
  | "content_rejected";

export interface RouteOutcomeInput {
  routeId: string;
  providerId: string;
  providerModelId?: string | undefined;
  region?: string | undefined;
  credentialId?: string | undefined;
  signal: HealthOutcomeSignal;
  latencyMs?: number | undefined;
  ttftMs?: number | undefined;
  statusCode?: number | undefined;
  errorCode?: string | undefined;
  permitId?: string | undefined;
  timestamp?: Date | undefined;
}

export interface RouteLatencyStats {
  p50LatencyMs?: number | undefined;
  p95LatencyMs?: number | undefined;
  averageLatencyMs?: number | undefined;
  sampleCount: number;
}

export interface ManualCircuitOverride {
  state: "FORCED_OPEN" | "FORCED_CLOSED";
  reason: string;
  setBy: string;
  setAt: Date;
  expiresAt?: Date | null | undefined;
}

export interface RouteHealthSnapshot {
  routeId: string;
  providerId: string;
  providerModelId?: string | undefined;
  region?: string | undefined;
  state: RouteHealthState;
  availabilityScore: number; // 0..100 normalized score
  successRate: number; // 0..1
  errorRate: number; // 0..1
  timeoutRate: number; // 0..1
  rateLimitRate: number; // 0..1
  sampleCount: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  latency: RouteLatencyStats;
  circuitState: CircuitState;
  openedAt?: Date | null | undefined;
  openCooldownMs?: number | undefined;
  reopenCount: number;
  activePermits: number;
  lastSuccessAt?: Date | null | undefined;
  lastFailureAt?: Date | null | undefined;
  lastProbeAt?: Date | null | undefined;
  manualOverride?: ManualCircuitOverride | null | undefined;
  updatedAt: Date;
}

export interface ExecutionPermit {
  allowed: boolean;
  circuitState: CircuitState;
  permitId?: string | undefined;
  reason?: string | undefined;
}
