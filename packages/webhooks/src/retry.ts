import type {
  WebhookDeliveryStatus,
  WebhookErrorCategory,
  WebhookRetryPolicy,
} from "./types.js";

export function calculateNextAttemptMs(
  attempt: number,
  policy: WebhookRetryPolicy,
  retryAfterSeconds?: number | undefined,
  random: () => number = Math.random,
): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    const clampedSeconds = Math.min(
      retryAfterSeconds,
      policy.maxRetryAfterSeconds,
    );
    return clampedSeconds * 1000;
  }

  if (attempt < 1) {
    attempt = 1;
  }

  const exponential = policy.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(policy.maxDelayMs, exponential);

  if (!policy.jitter) {
    return capped;
  }

  // Full jitter / decorrelated backoff: between 50% and 100% of capped delay
  const half = Math.floor(capped / 2);
  const jitterOffset = Math.floor(random() * half);
  return half + jitterOffset;
}

export function parseRetryAfterHeader(
  headerValue?: string | null,
): number | undefined {
  if (!headerValue) return undefined;

  // 1. Check if integer seconds
  const seconds = parseInt(headerValue, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds;
  }

  // 2. Check if HTTP Date string (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
  const date = Date.parse(headerValue);
  if (!isNaN(date)) {
    const diffMs = date - Date.now();
    return Math.max(0, Math.ceil(diffMs / 1000));
  }

  return undefined;
}

export function classifyDeliveryOutcome(params: {
  responseStatus?: number | undefined;
  error?: Error | undefined;
  currentAttempt: number;
  maxAttempts: number;
}): {
  status: WebhookDeliveryStatus;
  errorCategory?: WebhookErrorCategory | undefined;
  isRetryable: boolean;
} {
  const { responseStatus, error, currentAttempt, maxAttempts } = params;

  // 1. Success
  if (
    responseStatus !== undefined &&
    responseStatus >= 200 &&
    responseStatus < 300
  ) {
    return {
      status: "succeeded",
      isRetryable: false,
    };
  }

  // 2. HTTP 429 Rate Limited (Retryable)
  if (responseStatus === 429) {
    if (currentAttempt >= maxAttempts) {
      return {
        status: "dead_letter",
        errorCategory: "HTTP_429_RATE_LIMITED",
        isRetryable: false,
      };
    }
    return {
      status: "retrying",
      errorCategory: "HTTP_429_RATE_LIMITED",
      isRetryable: true,
    };
  }

  // 3. HTTP 5xx Server Error (Retryable)
  if (
    responseStatus !== undefined &&
    responseStatus >= 500 &&
    responseStatus < 600
  ) {
    if (currentAttempt >= maxAttempts) {
      return {
        status: "dead_letter",
        errorCategory: "HTTP_5XX_SERVER_ERROR",
        isRetryable: false,
      };
    }
    return {
      status: "retrying",
      errorCategory: "HTTP_5XX_SERVER_ERROR",
      isRetryable: true,
    };
  }

  // 4. HTTP 4xx Permanent Client Errors (Non-retryable -> dead_letter)
  if (
    responseStatus !== undefined &&
    (responseStatus === 400 ||
      responseStatus === 401 ||
      responseStatus === 403 ||
      responseStatus === 404 ||
      responseStatus === 410)
  ) {
    return {
      status: "dead_letter",
      errorCategory: "HTTP_4XX_CLIENT_ERROR",
      isRetryable: false,
    };
  }

  // 5. Explicit error classification
  if (error) {
    const msg = error.message.toLowerCase();

    if (
      msg.includes("ssrf") ||
      msg.includes("forbidden ip") ||
      msg.includes("private")
    ) {
      return {
        status: "dead_letter",
        errorCategory: "SSRF_BLOCKED",
        isRetryable: false,
      };
    }

    if (msg.includes("timeout") || msg.includes("aborted")) {
      if (currentAttempt >= maxAttempts) {
        return {
          status: "dead_letter",
          errorCategory: "TIMEOUT",
          isRetryable: false,
        };
      }
      return {
        status: "retrying",
        errorCategory: "TIMEOUT",
        isRetryable: true,
      };
    }

    if (
      msg.includes("dns") ||
      msg.includes("getaddrinfo") ||
      msg.includes("enotfound")
    ) {
      if (currentAttempt >= maxAttempts) {
        return {
          status: "dead_letter",
          errorCategory: "DNS_RESOLUTION_FAILED",
          isRetryable: false,
        };
      }
      return {
        status: "retrying",
        errorCategory: "DNS_RESOLUTION_FAILED",
        isRetryable: true,
      };
    }

    // Generic Network Error
    if (currentAttempt >= maxAttempts) {
      return {
        status: "dead_letter",
        errorCategory: "NETWORK_ERROR",
        isRetryable: false,
      };
    }
    return {
      status: "retrying",
      errorCategory: "NETWORK_ERROR",
      isRetryable: true,
    };
  }

  // Fallback
  if (currentAttempt >= maxAttempts) {
    return {
      status: "dead_letter",
      errorCategory: "UNKNOWN",
      isRetryable: false,
    };
  }
  return { status: "retrying", errorCategory: "UNKNOWN", isRetryable: true };
}
