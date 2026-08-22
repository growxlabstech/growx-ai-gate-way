import { describe, it, expect } from "vitest";
import {
  resolveEmbeddingDimensions,
  validateEmbeddingDimensions,
} from "../src/dimensions.js";
import { EmbeddingDimensionsUnsupportedError } from "../src/types.js";
import type { EmbeddingModelMetadata } from "@growx/contracts";

describe("Embedding Dimensions Validator", () => {
  const modelWithControl: EmbeddingModelMetadata = {
    defaultDimensions: 1536,
    dimensionControl: true,
    minDimensions: 256,
    maxDimensions: 1536,
    supportedDimensions: [256, 512, 1024, 1536],
    encodingFormats: ["float", "base64"],
    maxBatchItems: 2048,
    maxInputTokensPerItem: 8192,
    normalizedVector: true,
    distanceRecommendations: ["cosine"],
  };

  const modelWithoutControl: EmbeddingModelMetadata = {
    defaultDimensions: 768,
    dimensionControl: false,
    encodingFormats: ["float"],
    maxBatchItems: 2048,
    maxInputTokensPerItem: 8192,
    normalizedVector: true,
    distanceRecommendations: ["cosine"],
  };

  it("resolves default dimensions when omitted", () => {
    expect(resolveEmbeddingDimensions(undefined, modelWithControl)).toBe(1536);
    expect(resolveEmbeddingDimensions(undefined, modelWithoutControl)).toBe(
      768,
    );
  });

  it("accepts valid custom dimensions when supported", () => {
    expect(resolveEmbeddingDimensions(512, modelWithControl)).toBe(512);
  });

  it("rejects custom dimensions when model has dimensionControl=false", () => {
    expect(() => resolveEmbeddingDimensions(512, modelWithoutControl)).toThrow(
      EmbeddingDimensionsUnsupportedError,
    );
  });

  it("rejects dimensions below minimum", () => {
    expect(() => resolveEmbeddingDimensions(128, modelWithControl)).toThrow(
      EmbeddingDimensionsUnsupportedError,
    );
  });

  it("rejects dimensions above maximum", () => {
    expect(() => resolveEmbeddingDimensions(2048, modelWithControl)).toThrow(
      EmbeddingDimensionsUnsupportedError,
    );
  });

  it("rejects dimensions not in supportedDimensions list", () => {
    expect(() => resolveEmbeddingDimensions(300, modelWithControl)).toThrow(
      EmbeddingDimensionsUnsupportedError,
    );
  });
});
