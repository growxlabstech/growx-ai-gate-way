import type {
  EmbeddingEncodingFormat,
  EmbeddingModelMetadata,
  OpenAIEmbeddingData,
  OpenAIEmbeddingRequest,
  OpenAIEmbeddingResponse,
  OpenAIEmbeddingUsage,
  NormalizedEmbeddingItem,
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
} from "@growx/contracts";

export interface EmbeddingLimits {
  maxBatchItems: number;
  maxInputTokensPerItem: number;
  maxTotalTokensPerRequest: number;
  maxTotalBytesPerRequest: number;
}

export class EmbeddingValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "EmbeddingValidationError";
  }
}

export class EmbeddingDimensionsUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingDimensionsUnsupportedError";
  }
}

export class EmbeddingProviderInvalidResponseError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "EmbeddingProviderInvalidResponseError";
  }
}

export class EmbeddingVectorSpaceIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingVectorSpaceIncompatibleError";
  }
}
