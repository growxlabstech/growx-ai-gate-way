import { describe, expect, it } from "vitest";
import { GrowXProviderError } from "@growx/contracts";
import { classifyRetry, parseRetryAfter } from "../src/classifier.js";

describe("RetryClassifier", () => {
  describe("parseRetryAfter", () => {
    it("parses integer seconds", () => {
      expect(parseRetryAfter("5")).toBe(5000);
      expect(parseRetryAfter(10)).toBe(10000);
    });

    it("parses HTTP date string", () => {
      const future = new Date(Date.now() + 15000).toUTCString();
      const delay = parseRetryAfter(future);
      expect(delay).toBeDefined();
      expect(delay).toBeGreaterThanOrEqual(14000);
      expect(delay).toBeLessThanOrEqual(16000);
    });

    it("returns undefined for invalid or empty input", () => {
      expect(parseRetryAfter(undefined)).toBeUndefined();
      expect(parseRetryAfter("")).toBeUndefined();
      expect(parseRetryAfter("invalid-date")).toBeUndefined();
    });
  });

  describe("classifyRetry", () => {
    it("CRITICAL INVARIANT: denies fallback and retry if client-visible output was emitted", () => {
      const err = new GrowXProviderError(
        "provider_rate_limit",
        "Rate limit",
        true,
        429,
      );
      const res = classifyRetry(err, { emittedOutput: true });
      expect(res.retryable).toBe(false);
      expect(res.fallbackAllowed).toBe(false);
      expect(res.sameRouteAllowed).toBe(false);
    });

    it("classifies provider_rate_limit (429) as retryable rate limit", () => {
      const err = new GrowXProviderError(
        "provider_rate_limit",
        "Rate limit",
        true,
        429,
      );
      const res = classifyRetry(err, { retryAfterHeader: "3" });
      expect(res.retryable).toBe(true);
      expect(res.errorClass).toBe("RETRYABLE_RATE_LIMIT");
      expect(res.sameRouteAllowed).toBe(true);
      expect(res.fallbackAllowed).toBe(true);
      expect(res.reason).toBe("RATE_LIMIT");
      expect(res.suggestedDelayMs).toBe(3000);
    });

    it("classifies provider_timeout / gateway_timeout as retryable timeout", () => {
      const err = new GrowXProviderError(
        "provider_timeout",
        "Timeout",
        true,
        504,
      );
      const res = classifyRetry(err);
      expect(res.retryable).toBe(true);
      expect(res.errorClass).toBe("RETRYABLE_TIMEOUT");
      expect(res.reason).toBe("TIMEOUT");
    });

    it("classifies provider 5xx as retryable transient", () => {
      const err = new GrowXProviderError(
        "provider_unavailable",
        "Service down",
        true,
        503,
      );
      const res = classifyRetry(err);
      expect(res.retryable).toBe(true);
      expect(res.errorClass).toBe("RETRYABLE_TRANSIENT");
      expect(res.reason).toBe("PROVIDER_UNAVAILABLE");
    });

    it("classifies provider_authentication_error as NON_RETRYABLE_AUTH (allows fallback to other route, denies same-route retry)", () => {
      const err = new GrowXProviderError(
        "provider_authentication_error",
        "Bad api key",
        false,
        401,
      );
      const res = classifyRetry(err);
      expect(res.retryable).toBe(false);
      expect(res.errorClass).toBe("NON_RETRYABLE_AUTH");
      expect(res.sameRouteAllowed).toBe(false); // Do not retry same bad credential
      expect(res.fallbackAllowed).toBe(true); // Allow fallback to alternate route
      expect(res.reason).toBe("CREDENTIAL_FAILURE");
    });

    it("classifies provider_invalid_request (400) as NON_RETRYABLE_REQUEST (no retry, no fallback)", () => {
      const err = new GrowXProviderError(
        "provider_invalid_request",
        "Bad payload",
        false,
        400,
      );
      const res = classifyRetry(err);
      expect(res.retryable).toBe(false);
      expect(res.errorClass).toBe("NON_RETRYABLE_REQUEST");
      expect(res.sameRouteAllowed).toBe(false);
      expect(res.fallbackAllowed).toBe(false);
    });

    it("classifies provider_content_policy as NON_RETRYABLE_CONTENT (safety invariant: no bypass via fallback)", () => {
      const err = new GrowXProviderError(
        "provider_content_policy",
        "Content flagged",
        false,
        400,
      );
      const res = classifyRetry(err);
      expect(res.retryable).toBe(false);
      expect(res.errorClass).toBe("NON_RETRYABLE_CONTENT");
      expect(res.sameRouteAllowed).toBe(false);
      expect(res.fallbackAllowed).toBe(false);
    });

    it("classifies network errors (e.g. ECONNRESET, fetch failed) as RETRYABLE_TRANSIENT", () => {
      const netErr = new Error("fetch failed: ECONNRESET");
      const res = classifyRetry(netErr);
      expect(res.retryable).toBe(true);
      expect(res.errorClass).toBe("RETRYABLE_TRANSIENT");
      expect(res.reason).toBe("NETWORK_ERROR");
    });

    it("classifies client cancellation as non-retryable", () => {
      const abortErr = new Error("The user aborted a request");
      abortErr.name = "AbortError";
      const res = classifyRetry(abortErr);
      expect(res.retryable).toBe(false);
      expect(res.fallbackAllowed).toBe(false);
    });
  });
});
