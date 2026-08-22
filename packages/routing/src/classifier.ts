import { GrowXProviderError } from "@growx/contracts";
import type {
  FallbackReasonCode,
  RetryClassificationContext,
  RetryClassificationResult,
  RetryErrorClass,
} from "./resilience-types.js";

/**
 * Parses HTTP Retry-After header safely:
 * - Integer seconds e.g. "5" -> 5000ms
 * - HTTP date string e.g. "Wed, 21 Oct 2026 07:28:00 GMT" -> diff from now
 */
export function parseRetryAfter(
  headerValue?: string | number | null,
): number | undefined {
  if (headerValue === undefined || headerValue === null || headerValue === "") {
    return undefined;
  }

  if (typeof headerValue === "number") {
    return Math.max(0, Math.round(headerValue * 1000));
  }

  const trimmed = String(headerValue).trim();
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric * 1000));
  }

  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return Math.max(0, diff);
  }

  return undefined;
}

/**
 * Classifies an execution error into canonical retry & fallback decisions.
 * CRITICAL INVARIANT: If client-visible model output was emitted, fallback is ALWAYS denied.
 */
export function classifyRetry(
  error: unknown,
  context: RetryClassificationContext = {},
): RetryClassificationResult {
  const { emittedOutput = false, retryAfterHeader } = context;
  const suggestedDelayMs = parseRetryAfter(retryAfterHeader);

  // CRITICAL INVARIANT: Never fallback or cross-retry after customer-visible stream output
  if (emittedOutput) {
    return {
      retryable: false,
      errorClass: "UNKNOWN",
      sameRouteAllowed: false,
      fallbackAllowed: false,
      suggestedDelayMs: undefined,
      reason: "OTHER_TRANSIENT",
      safeMessage:
        "Stream error occurred after model output commenced; retries aborted to prevent duplication",
    };
  }

  // 1. GrowXProviderError Instance Handling
  if (error instanceof GrowXProviderError) {
    const code = error.code;
    const status = error.status;

    switch (code) {
      case "provider_rate_limit":
        return {
          retryable: true,
          errorClass: "RETRYABLE_RATE_LIMIT",
          sameRouteAllowed: true,
          fallbackAllowed: true,
          suggestedDelayMs,
          reason: "RATE_LIMIT",
          safeMessage:
            "Provider rate limit reached; queued for retry or alternate candidate",
        };

      case "provider_timeout":
      case "gateway_timeout":
        return {
          retryable: true,
          errorClass: "RETRYABLE_TIMEOUT",
          sameRouteAllowed: true,
          fallbackAllowed: true,
          suggestedDelayMs,
          reason: "TIMEOUT",
          safeMessage:
            "Provider request timed out before response was received",
        };

      case "provider_unavailable":
      case "provider_server_error":
        return {
          retryable: true,
          errorClass: "RETRYABLE_TRANSIENT",
          sameRouteAllowed: true,
          fallbackAllowed: true,
          suggestedDelayMs,
          reason: "PROVIDER_UNAVAILABLE",
          safeMessage: "Provider returned a transient server error",
        };

      case "provider_authentication_error":
        return {
          retryable: false,
          errorClass: "NON_RETRYABLE_AUTH",
          sameRouteAllowed: false, // Never retry same invalid credential
          fallbackAllowed: true, // Allow fallback to alternate provider / credential
          suggestedDelayMs: undefined,
          reason: "CREDENTIAL_FAILURE",
          safeMessage:
            "Provider authentication failed with configured credential",
        };

      case "model_not_found":
      case "model_unavailable":
        return {
          retryable: false,
          errorClass: "NON_RETRYABLE_MODEL",
          sameRouteAllowed: false,
          fallbackAllowed: true, // Allow fallback to alternate route for canonical model
          suggestedDelayMs: undefined,
          reason: "MODEL_UNAVAILABLE",
          safeMessage: "Model route is currently unavailable at provider",
        };

      case "provider_invalid_request":
        return {
          retryable: false,
          errorClass: "NON_RETRYABLE_REQUEST",
          sameRouteAllowed: false,
          fallbackAllowed: false, // Never retry invalid payload across providers blindly
          suggestedDelayMs: undefined,
          reason: "OTHER_TRANSIENT",
          safeMessage:
            error.message || "Invalid request payload rejected by provider",
        };

      case "provider_content_policy":
        return {
          retryable: false,
          errorClass: "NON_RETRYABLE_CONTENT",
          sameRouteAllowed: false,
          fallbackAllowed: false, // Safety invariant: never bypass safety rejections via fallback
          suggestedDelayMs: undefined,
          reason: "OTHER_TRANSIENT",
          safeMessage:
            "Request was rejected by provider safety & content filter policy",
        };

      case "model_not_allowed":
      case "model_disabled":
      case "model_retired":
      case "model_not_executable":
      case "model_capability_not_supported":
        return {
          retryable: false,
          errorClass: "NON_RETRYABLE_POLICY",
          sameRouteAllowed: false,
          fallbackAllowed: false,
          suggestedDelayMs: undefined,
          reason: "OTHER_TRANSIENT",
          safeMessage: error.message,
        };

      case "request_cancelled":
        return {
          retryable: false,
          errorClass: "UNKNOWN",
          sameRouteAllowed: false,
          fallbackAllowed: false,
          suggestedDelayMs: undefined,
          reason: "OTHER_TRANSIENT",
          safeMessage: "Client cancelled request",
        };

      default:
        // Status code heuristic fallback for unrecognized error codes
        if (status === 429) {
          return {
            retryable: true,
            errorClass: "RETRYABLE_RATE_LIMIT",
            sameRouteAllowed: true,
            fallbackAllowed: true,
            suggestedDelayMs,
            reason: "RATE_LIMIT",
            safeMessage: "Provider rate limit reached",
          };
        }
        if (status >= 500 && status <= 599) {
          return {
            retryable: true,
            errorClass: "RETRYABLE_TRANSIENT",
            sameRouteAllowed: true,
            fallbackAllowed: true,
            suggestedDelayMs,
            reason: "PROVIDER_UNAVAILABLE",
            safeMessage: "Provider transient server error",
          };
        }
        return {
          retryable: false,
          errorClass: "UNKNOWN",
          sameRouteAllowed: false,
          fallbackAllowed: false,
          suggestedDelayMs: undefined,
          reason: "OTHER_TRANSIENT",
          safeMessage: error.message || "Provider error",
        };
    }
  }

  // 2. Generic Error or Network Faults
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (
      name.includes("abort") ||
      msg.includes("abort") ||
      msg.includes("cancel")
    ) {
      return {
        retryable: false,
        errorClass: "UNKNOWN",
        sameRouteAllowed: false,
        fallbackAllowed: false,
        suggestedDelayMs: undefined,
        reason: "OTHER_TRANSIENT",
        safeMessage: "Operation cancelled",
      };
    }

    if (
      msg.includes("timeout") ||
      msg.includes("etimedout") ||
      msg.includes("timed out")
    ) {
      return {
        retryable: true,
        errorClass: "RETRYABLE_TIMEOUT",
        sameRouteAllowed: true,
        fallbackAllowed: true,
        suggestedDelayMs,
        reason: "TIMEOUT",
        safeMessage: "Network connection or request timed out",
      };
    }

    if (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("fetch failed") ||
      msg.includes("network error")
    ) {
      return {
        retryable: true,
        errorClass: "RETRYABLE_TRANSIENT",
        sameRouteAllowed: true,
        fallbackAllowed: true,
        suggestedDelayMs,
        reason: "NETWORK_ERROR",
        safeMessage: "Transient network connection failure",
      };
    }
  }

  // 3. Fallback for unknown / unhandled exceptions
  return {
    retryable: false,
    errorClass: "UNKNOWN",
    sameRouteAllowed: false,
    fallbackAllowed: false,
    suggestedDelayMs: undefined,
    reason: "OTHER_TRANSIENT",
    safeMessage: "An unexpected error occurred during execution",
  };
}
