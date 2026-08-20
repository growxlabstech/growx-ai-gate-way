import { EmbeddingProviderInvalidResponseError } from "./types.js";

export interface ProviderRawEmbeddingItem {
  index: number;
  embedding: number[] | string;
}

export class EmbeddingResponseValidator {
  public static validate(
    items: readonly ProviderRawEmbeddingItem[],
    expectedCount: number,
    expectedDimensions: number
  ): void {
    if (!Array.isArray(items)) {
      throw new EmbeddingProviderInvalidResponseError(
        "EMBEDDING_PROVIDER_RESPONSE_MALFORMED",
        "Provider response data must be an array"
      );
    }

    if (items.length !== expectedCount) {
      throw new EmbeddingProviderInvalidResponseError(
        "EMBEDDING_PROVIDER_COUNT_MISMATCH",
        `Provider returned ${items.length} embeddings, but ${expectedCount} were requested`
      );
    }

    const seenIndices = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item.index !== "number") {
        throw new EmbeddingProviderInvalidResponseError(
          "EMBEDDING_PROVIDER_INVALID_ITEM",
          `Item at position ${i} is missing numeric index`
        );
      }

      if (seenIndices.has(item.index)) {
        throw new EmbeddingProviderInvalidResponseError(
          "EMBEDDING_PROVIDER_DUPLICATE_INDEX",
          `Duplicate index ${item.index} encountered in provider response`
        );
      }
      seenIndices.add(item.index);

      if (item.index < 0 || item.index >= expectedCount) {
        throw new EmbeddingProviderInvalidResponseError(
          "EMBEDDING_PROVIDER_INDEX_OUT_OF_BOUNDS",
          `Index ${item.index} is out of bounds [0, ${expectedCount - 1}]`
        );
      }

      if (Array.isArray(item.embedding)) {
        const vec = item.embedding as number[];
        if (vec.length !== expectedDimensions) {
          throw new EmbeddingProviderInvalidResponseError(
            "EMBEDDING_PROVIDER_DIMENSION_MISMATCH",
            `Vector at index ${item.index} has dimension ${vec.length}, expected ${expectedDimensions}`
          );
        }

        for (let d = 0; d < vec.length; d++) {
          const val = vec[d]!;
          if (typeof val !== "number" || !Number.isFinite(val)) {
            throw new EmbeddingProviderInvalidResponseError(
              "EMBEDDING_PROVIDER_NON_FINITE_VALUE",
              `Non-finite numeric value (${val}) detected at vector index ${item.index}, dimension ${d}`
            );
          }
        }
      } else if (typeof item.embedding === "string") {
        if (item.embedding.length === 0) {
          throw new EmbeddingProviderInvalidResponseError(
            "EMBEDDING_PROVIDER_EMPTY_BASE64",
            `Base64 embedding at index ${item.index} is empty`
          );
        }
      } else {
        throw new EmbeddingProviderInvalidResponseError(
          "EMBEDDING_PROVIDER_INVALID_VECTOR_TYPE",
          `Embedding at index ${item.index} must be array of numbers or base64 string`
        );
      }
    }
  }

  public static sortByIndex<T extends { index: number }>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => a.index - b.index);
  }
}
