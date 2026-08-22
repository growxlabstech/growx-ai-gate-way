import type { EmbeddingModelMetadata } from "@growx/contracts";
import { EmbeddingDimensionsUnsupportedError } from "./types.js";

export function resolveEmbeddingDimensions(
  requestedDimensions: number | undefined,
  metadata: EmbeddingModelMetadata,
): number {
  if (requestedDimensions === undefined) {
    return metadata.defaultDimensions;
  }

  validateEmbeddingDimensions(requestedDimensions, metadata);
  return requestedDimensions;
}

export function validateEmbeddingDimensions(
  dimensions: number,
  metadata: EmbeddingModelMetadata,
): void {
  if (dimensions === metadata.defaultDimensions) {
    return;
  }

  if (!metadata.dimensionControl) {
    throw new EmbeddingDimensionsUnsupportedError(
      `Model does not support dimension customization. Default dimension is ${metadata.defaultDimensions}, but ${dimensions} was requested.`,
    );
  }

  if (metadata.minDimensions && dimensions < metadata.minDimensions) {
    throw new EmbeddingDimensionsUnsupportedError(
      `Requested dimension ${dimensions} is less than model minimum of ${metadata.minDimensions}`,
    );
  }

  if (metadata.maxDimensions && dimensions > metadata.maxDimensions) {
    throw new EmbeddingDimensionsUnsupportedError(
      `Requested dimension ${dimensions} exceeds model maximum of ${metadata.maxDimensions}`,
    );
  }

  if (metadata.supportedDimensions && metadata.supportedDimensions.length > 0) {
    if (!metadata.supportedDimensions.includes(dimensions)) {
      throw new EmbeddingDimensionsUnsupportedError(
        `Requested dimension ${dimensions} is not in the list of supported dimensions: [${metadata.supportedDimensions.join(", ")}]`,
      );
    }
  }
}
