/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  AnthropicAdapter,
  OpenAIAdapter,
  type ProviderAdapter,
} from "@growx/provider-sdk";
import { GrowXProviderError } from "@growx/contracts";

describe("Provider Adapter Compliance Contract", () => {
  const adapters: ProviderAdapter[] = [
    new OpenAIAdapter("openai"),
    new AnthropicAdapter("anthropic"),
  ];

  for (const adapter of adapters) {
    describe(`Adapter: ${adapter.providerId}`, () => {
      it("exposes expected providerId", () => {
        expect(adapter.providerId).toBeTruthy();
      });

      it("validates configuration correctly", () => {
        expect(() =>
          adapter.validateConfiguration({ baseUrl: "https://api.example.com" }),
        ).not.toThrow();
        expect(() =>
          adapter.validateConfiguration({ baseUrl: "invalid-url" }),
        ).toThrow(GrowXProviderError);
      });

      it("checks native capabilities correctly", () => {
        expect(adapter.supports("text.generate")).toBe(true);
        expect(adapter.supports("streaming")).toBe(true);
        expect(adapter.supports("tools.call")).toBe(true);
      });

      it("normalizes authentication error", () => {
        const err = adapter.normalizeError({
          status: 401,
          message: "Invalid API key",
        });
        expect(err).toBeInstanceOf(GrowXProviderError);
        expect(err.code).toBe("provider_authentication_error");
        expect(err.retryable).toBe(false);
      });

      it("normalizes rate limit error", () => {
        const err = adapter.normalizeError({
          status: 429,
          message: "Rate limit exceeded",
        });
        expect(err).toBeInstanceOf(GrowXProviderError);
        expect(err.code).toBe("provider_rate_limit");
        expect(err.retryable).toBe(true);
      });

      it("normalizes cancellation error", () => {
        const domErr = new DOMException(
          "The user aborted a request.",
          "AbortError",
        );
        const err = adapter.normalizeError(domErr);
        expect(err).toBeInstanceOf(GrowXProviderError);
        expect(err.code).toBe("request_cancelled");
        expect(err.retryable).toBe(false);
      });

      it("normalizes timeout error", () => {
        const timeoutErr = new Error("Request timed out");
        timeoutErr.name = "TimeoutError";
        const err = adapter.normalizeError(timeoutErr);
        expect(err).toBeInstanceOf(GrowXProviderError);
        expect(err.code).toBe("provider_timeout");
        expect(err.retryable).toBe(true);
      });

      it("extracts usage safely even with null or empty input", () => {
        const emptyUsage = adapter.extractUsage(null);
        expect(emptyUsage.inputTokens).toBe(0);
        expect(emptyUsage.outputTokens).toBe(0);
        expect(emptyUsage.totalTokens).toBe(0);
        expect(emptyUsage.source).toBe("unavailable");
      });
    });
  }
});
