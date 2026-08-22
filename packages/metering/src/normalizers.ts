import type { NormalizedProviderUsage } from "./types.js";
import { TokenEstimator } from "@growx/rate-limits";

/**
 * Normalizes OpenAI usage fields into canonical NormalizedProviderUsage.
 */
export function normalizeOpenAIUsage(rawUsage: any): NormalizedProviderUsage {
  if (!rawUsage || typeof rawUsage !== "object") {
    return { source: "unavailable", confidence: "unknown" };
  }

  const inputTokens =
    typeof rawUsage.prompt_tokens === "number"
      ? rawUsage.prompt_tokens
      : undefined;
  const outputTokens =
    typeof rawUsage.completion_tokens === "number"
      ? rawUsage.completion_tokens
      : undefined;
  const totalTokens =
    typeof rawUsage.total_tokens === "number"
      ? rawUsage.total_tokens
      : (inputTokens ?? 0) + (outputTokens ?? 0);

  const cachedInputTokens =
    typeof rawUsage.prompt_tokens_details?.cached_tokens === "number"
      ? rawUsage.prompt_tokens_details.cached_tokens
      : undefined;

  const reasoningTokens =
    typeof rawUsage.completion_tokens_details?.reasoning_tokens === "number"
      ? rawUsage.completion_tokens_details.reasoning_tokens
      : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    source: "provider_reported",
    confidence: "exact",
  };
}

/**
 * Normalizes Anthropic usage fields into canonical NormalizedProviderUsage.
 */
export function normalizeAnthropicUsage(
  rawUsage: any,
): NormalizedProviderUsage {
  if (!rawUsage || typeof rawUsage !== "object") {
    return { source: "unavailable", confidence: "unknown" };
  }

  const inputTokens =
    typeof rawUsage.input_tokens === "number"
      ? rawUsage.input_tokens
      : undefined;
  const outputTokens =
    typeof rawUsage.output_tokens === "number"
      ? rawUsage.output_tokens
      : undefined;
  const cachedInputTokens =
    typeof rawUsage.cache_read_input_tokens === "number"
      ? rawUsage.cache_read_input_tokens
      : typeof rawUsage.cache_creation_input_tokens === "number"
        ? rawUsage.cache_creation_input_tokens
        : undefined;

  const totalTokens =
    inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    source: "provider_reported",
    confidence: "exact",
  };
}

/**
 * Normalizes Google Gemini usage metadata into canonical NormalizedProviderUsage.
 */
export function normalizeGeminiUsage(rawUsage: any): NormalizedProviderUsage {
  if (!rawUsage || typeof rawUsage !== "object") {
    return { source: "unavailable", confidence: "unknown" };
  }

  const inputTokens =
    typeof rawUsage.promptTokenCount === "number"
      ? rawUsage.promptTokenCount
      : undefined;
  const outputTokens =
    typeof rawUsage.candidatesTokenCount === "number"
      ? rawUsage.candidatesTokenCount
      : undefined;
  const totalTokens =
    typeof rawUsage.totalTokenCount === "number"
      ? rawUsage.totalTokenCount
      : (inputTokens ?? 0) + (outputTokens ?? 0);
  const cachedInputTokens =
    typeof rawUsage.cachedContentTokenCount === "number"
      ? rawUsage.cachedContentTokenCount
      : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    source: "provider_reported",
    confidence: "exact",
  };
}

/**
 * Normalizes provider usage from generic response payload or extracts using registered provider adapters.
 */
export function normalizeProviderUsage(
  providerId: string,
  rawPayload: any,
  fallbackRequest?: any,
  estimator?: TokenEstimator,
): NormalizedProviderUsage {
  if (rawPayload && typeof rawPayload === "object") {
    const rawUsage = rawPayload.usage ?? rawPayload.usageMetadata ?? rawPayload;

    if (providerId.toLowerCase().includes("openai")) {
      const normalized = normalizeOpenAIUsage(rawUsage);
      if (normalized.source !== "unavailable") return normalized;
    } else if (providerId.toLowerCase().includes("anthropic")) {
      const normalized = normalizeAnthropicUsage(rawUsage);
      if (normalized.source !== "unavailable") return normalized;
    } else if (
      providerId.toLowerCase().includes("gemini") ||
      providerId.toLowerCase().includes("google")
    ) {
      const normalized = normalizeGeminiUsage(rawUsage);
      if (normalized.source !== "unavailable") return normalized;
    } else if (
      typeof rawUsage.inputTokens === "number" &&
      typeof rawUsage.outputTokens === "number"
    ) {
      return {
        inputTokens: rawUsage.inputTokens,
        outputTokens: rawUsage.outputTokens,
        totalTokens:
          rawUsage.totalTokens ?? rawUsage.inputTokens + rawUsage.outputTokens,
        cachedInputTokens: rawUsage.cachedInputTokens,
        reasoningTokens: rawUsage.reasoningTokens,
        source: "provider_reported",
        confidence: "exact",
      };
    }
  }

  // If usage is unavailable and fallback estimation is requested
  if (fallbackRequest) {
    const tokenEst = estimator ?? new TokenEstimator();
    const est = tokenEst.estimate(fallbackRequest);
    return {
      inputTokens: est.inputTokens,
      outputTokens: est.estimatedOutputReservation,
      totalTokens: est.totalEstimatedTokens,
      source: "estimated",
      confidence: "estimated",
    };
  }

  return {
    source: "unavailable",
    confidence: "unknown",
  };
}
