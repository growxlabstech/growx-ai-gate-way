import { EmbeddingValidationError, type EmbeddingLimits } from "./types.js";

export function estimateInputTokens(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 characters per token for English/code, minimum 1 token per non-empty word
  const charBased = Math.ceil(text.length / 4);
  const wordBased = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(charBased, wordBased, 1);
}

export function normalizeEmbeddingInput(rawInput: string | string[] | number[] | number[][]): string[] {
  if (typeof rawInput === "string") {
    const trimmed = rawInput.trim();
    if (trimmed.length === 0) {
      throw new EmbeddingValidationError("EMBEDDING_EMPTY_INPUT", "Input string must not be empty");
    }
    return [rawInput];
  }

  if (Array.isArray(rawInput)) {
    if (rawInput.length === 0) {
      throw new EmbeddingValidationError("EMBEDDING_EMPTY_BATCH", "Input array must not be empty");
    }

    // Check if array of numbers (single token array)
    if (typeof rawInput[0] === "number") {
      throw new EmbeddingValidationError("EMBEDDING_UNSUPPORTED_INPUT_TYPE", "Direct token arrays are not supported on this endpoint. Please pass string or string array.");
    }

    // Array of strings
    if (typeof rawInput[0] === "string") {
      const strings = rawInput as string[];
      for (let i = 0; i < strings.length; i++) {
        const item = strings[i];
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new EmbeddingValidationError("EMBEDDING_EMPTY_INPUT_ITEM", `Input item at index ${i} must be a non-empty string`);
        }
      }
      return strings;
    }
  }

  throw new EmbeddingValidationError("EMBEDDING_INVALID_INPUT", "Input must be a non-empty string or array of non-empty strings");
}

export function validateEmbeddingInput(
  inputs: string[],
  limits: EmbeddingLimits
): { totalEstimatedTokens: number; totalBytes: number } {
  if (inputs.length > limits.maxBatchItems) {
    throw new EmbeddingValidationError(
      "EMBEDDING_BATCH_TOO_LARGE",
      `Input batch size ${inputs.length} exceeds maximum allowed of ${limits.maxBatchItems}`
    );
  }

  let totalEstimatedTokens = 0;
  let totalBytes = 0;

  for (let i = 0; i < inputs.length; i++) {
    const text = inputs[i]!;
    const bytes = Buffer.byteLength(text, "utf8");
    totalBytes += bytes;

    const tokens = estimateInputTokens(text);
    if (tokens > limits.maxInputTokensPerItem) {
      throw new EmbeddingValidationError(
        "EMBEDDING_INPUT_TOO_LARGE",
        `Input item at index ${i} exceeds token limit (${tokens} estimated tokens > ${limits.maxInputTokensPerItem})`
      );
    }
    totalEstimatedTokens += tokens;
  }

  if (totalEstimatedTokens > limits.maxTotalTokensPerRequest) {
    throw new EmbeddingValidationError(
      "EMBEDDING_TOTAL_TOKENS_EXCEEDED",
      `Total estimated tokens (${totalEstimatedTokens}) exceeds request limit (${limits.maxTotalTokensPerRequest})`
    );
  }

  if (totalBytes > limits.maxTotalBytesPerRequest) {
    throw new EmbeddingValidationError(
      "EMBEDDING_TOTAL_BYTES_EXCEEDED",
      `Total input bytes (${totalBytes}) exceeds request limit (${limits.maxTotalBytesPerRequest})`
    );
  }

  return { totalEstimatedTokens, totalBytes };
}
