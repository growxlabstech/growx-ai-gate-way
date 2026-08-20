export interface NotificationRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitterFactor: number;
}

export const DEFAULT_NOTIFICATION_RETRY_POLICY: NotificationRetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 2000,   // 2s
  maxDelayMs: 600_000,    // 10m
  backoffFactor: 2,
  jitterFactor: 0.2,
};

export function calculateNextNotificationAttemptMs(
  attempt: number,
  policy: NotificationRetryPolicy = DEFAULT_NOTIFICATION_RETRY_POLICY,
  retryAfterSeconds?: number | undefined
): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    const requestedMs = retryAfterSeconds * 1000;
    return Math.min(requestedMs, policy.maxDelayMs);
  }

  const baseDelay = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(baseDelay, policy.maxDelayMs);

  // Apply deterministic symmetric jitter
  const jitterRange = cappedDelay * policy.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  return Math.max(policy.initialDelayMs, Math.round(cappedDelay + jitter));
}

export function classifyNotificationOutcome(params: {
  responseStatus?: number | undefined;
  error?: Error | undefined;
  currentAttempt: number;
  maxAttempts: number;
}): {
  status: "delivered" | "retrying" | "failed";
  retryable: boolean;
  errorCategory?: string | undefined;
} {
  const { responseStatus, error, currentAttempt, maxAttempts } = params;

  if (responseStatus !== undefined && responseStatus >= 200 && responseStatus < 300) {
    return { status: "delivered", retryable: false };
  }

  // Network or timeout errors
  if (error) {
    const isTimeout =
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error.message.includes("timeout");
    const category = isTimeout ? "TIMEOUT" : "NETWORK_ERROR";

    if (currentAttempt >= maxAttempts) {
      return { status: "failed", retryable: false, errorCategory: category };
    }
    return { status: "retrying", retryable: true, errorCategory: category };
  }

  if (responseStatus === 429) {
    if (currentAttempt >= maxAttempts) {
      return { status: "failed", retryable: false, errorCategory: "RATE_LIMITED" };
    }
    return { status: "retrying", retryable: true, errorCategory: "RATE_LIMITED" };
  }

  if (responseStatus !== undefined && responseStatus >= 500) {
    if (currentAttempt >= maxAttempts) {
      return { status: "failed", retryable: false, errorCategory: "PROVIDER_5XX" };
    }
    return { status: "retrying", retryable: true, errorCategory: "PROVIDER_5XX" };
  }

  // 4xx Client Errors (e.g. invalid recipient, domain unverified) -> non-retryable
  return {
    status: "failed",
    retryable: false,
    errorCategory: responseStatus ? `CLIENT_ERROR_${responseStatus}` : "UNKNOWN",
  };
}
