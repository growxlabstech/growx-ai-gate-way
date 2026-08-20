import type { EmbeddingBatchChunk, EmbeddingBatchPlan } from "@growx/contracts";
import { estimateInputTokens } from "./input-validator.js";

export class EmbeddingBatchPlanner {
  public static plan(
    inputs: readonly string[],
    maxChunkSize: number = 2048,
    maxTokensPerChunk: number = 100_000
  ): EmbeddingBatchPlan {
    const chunks: EmbeddingBatchChunk[] = [];
    let currentInputs: string[] = [];
    let currentTokenEstimate = 0;
    let chunkStartIndex = 0;
    let chunkIndex = 0;
    let totalTokensEstimated = 0;

    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i]!;
      const tokens = estimateInputTokens(text);
      totalTokensEstimated += tokens;

      const wouldExceedSize = currentInputs.length >= maxChunkSize;
      const wouldExceedTokens = currentInputs.length > 0 && currentTokenEstimate + tokens > maxTokensPerChunk;

      if (wouldExceedSize || wouldExceedTokens) {
        chunks.push({
          chunkIndex,
          startIndex: chunkStartIndex,
          endIndex: chunkStartIndex + currentInputs.length - 1,
          inputs: currentInputs,
          tokenEstimate: currentTokenEstimate,
        });

        chunkIndex++;
        chunkStartIndex = i;
        currentInputs = [text];
        currentTokenEstimate = tokens;
      } else {
        currentInputs.push(text);
        currentTokenEstimate += tokens;
      }
    }

    if (currentInputs.length > 0) {
      chunks.push({
        chunkIndex,
        startIndex: chunkStartIndex,
        endIndex: chunkStartIndex + currentInputs.length - 1,
        inputs: currentInputs,
        tokenEstimate: currentTokenEstimate,
      });
    }

    return {
      totalItems: inputs.length,
      totalTokensEstimated,
      chunks,
      maxChunkSize,
    };
  }
}
