export type RetryErrorClass =
  | "RETRYABLE_TRANSIENT"
  | "RETRYABLE_RATE_LIMIT"
  | "RETRYABLE_TIMEOUT"
  | "NON_RETRYABLE_AUTH"
  | "NON_RETRYABLE_REQUEST"
  | "NON_RETRYABLE_CONTENT"
  | "NON_RETRYABLE_MODEL"
  | "NON_RETRYABLE_POLICY"
  | "UNKNOWN";

export type FallbackReasonCode =
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "MODEL_UNAVAILABLE"
  | "CREDENTIAL_FAILURE"
  | "OTHER_TRANSIENT";

export type GatewayAttemptStatus =
  "pending" | "executing" | "succeeded" | "failed" | "cancelled" | "timed_out";

export interface RetryPolicy {
  /** Maximum total provider attempts per request (default: 3, max cap: 5) */
  maxAttempts: number;
  /** Maximum consecutive retries on the same provider route (default: 1) */
  maxSameRouteRetries: number;
  /** Maximum number of fallback candidate routes to try (default: 2) */
  maxFallbackRoutes: number;
  /** Base backoff delay in milliseconds (default: 100ms) */
  baseBackoffMs: number;
  /** Maximum backoff delay in milliseconds (default: 2000ms) */
  maxBackoffMs: number;
  /** Jitter algorithm to prevent thundering herds (default: 'full') */
  jitter: "full" | "equal" | "decorrelated" | "none";
  /** Error classes that qualify for retry */
  retryableErrorClasses: RetryErrorClass[];
  /** Whether cross-provider fallback is permitted before client-visible output (default: true) */
  allowCrossProviderFallback: boolean;
  /** Whether same-provider different route/credential fallback is permitted (default: true) */
  allowSameProviderFallback: boolean;
  /** Minimum remaining request deadline in ms required to initiate a retry (default: 500ms) */
  minimumRemainingDeadlineMs: number;
}

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxAttempts: 3,
  maxSameRouteRetries: 1,
  maxFallbackRoutes: 2,
  baseBackoffMs: 100,
  maxBackoffMs: 2000,
  jitter: "full" as const,
  retryableErrorClasses: [
    "RETRYABLE_TRANSIENT",
    "RETRYABLE_RATE_LIMIT",
    "RETRYABLE_TIMEOUT",
  ] as RetryErrorClass[],
  allowCrossProviderFallback: true,
  allowSameProviderFallback: true,
  minimumRemainingDeadlineMs: 500,
});

export interface RetryClassificationResult {
  retryable: boolean;
  errorClass: RetryErrorClass;
  sameRouteAllowed: boolean;
  fallbackAllowed: boolean;
  suggestedDelayMs?: number | undefined;
  reason: FallbackReasonCode;
  safeMessage: string;
}

export interface RetryClassificationContext {
  attemptNumber?: number | undefined;
  emittedOutput?: boolean | undefined;
  httpStatusCode?: number | undefined;
  retryAfterHeader?: string | number | undefined;
  isStreaming?: boolean | undefined;
}

export interface GatewayAttemptEntity {
  id: string;
  requestId: string;
  attemptNumber: number;
  routeId: string;
  providerId: string;
  providerModelId: string;
  status: GatewayAttemptStatus;
  startedAt: Date;
  firstTokenAt?: Date | null | undefined;
  completedAt: Date | null;
  latencyMs: number | null;
  errorCode: string | null;
  retryable: boolean;
  fallbackReason: FallbackReasonCode | null;
  providerRequestId: string | null;
  emittedClientOutput: boolean;
  usage: any | null;
  createdAt: Date;
}
