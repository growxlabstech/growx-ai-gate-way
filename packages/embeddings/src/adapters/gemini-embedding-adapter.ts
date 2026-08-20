import type {
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
} from "@growx/contracts";
import type { ProviderEmbeddingAdapter } from "./provider-embedding-adapter.js";
import { EmbeddingProviderInvalidResponseError } from "../types.js";

export class GeminiEmbeddingAdapter implements ProviderEmbeddingAdapter {
  public readonly providerId = "gemini";

  public translateRequest(request: NormalizedEmbeddingRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  } {
    const requests = request.inputs.map((text: string) => {
      const item: Record<string, unknown> = {
        model: `models/${request.providerModelId}`,
        content: {
          parts: [{ text }],
        },
      };
      if (request.dimensions !== undefined) {
        item.outputDimensionality = request.dimensions;
      }
      return item;
    });

    return {
      urlPath: `/v1beta/models/${request.providerModelId}:batchEmbedContents`,
      method: "POST",
      body: { requests },
    };
  }

  public parseResponse(
    rawResponse: unknown,
    request: NormalizedEmbeddingRequest,
    dimensions: number
  ): NormalizedEmbeddingResponse {
    if (!rawResponse || typeof rawResponse !== "object") {
      throw new EmbeddingProviderInvalidResponseError(
        "GEMINI_MALFORMED_RESPONSE",
        "Gemini response is not a valid object"
      );
    }

    const data = rawResponse as any;
    const embeddingsList = data.embeddings || data.entries || [];
    if (!Array.isArray(embeddingsList)) {
      throw new EmbeddingProviderInvalidResponseError(
        "GEMINI_MISSING_EMBEDDINGS",
        "Gemini response missing embeddings array"
      );
    }

    const embeddings = embeddingsList.map((item: any, idx: number) => {
      const values = item.values || [];
      return {
        index: idx,
        embedding: values,
      };
    });

    // Approximate tokens if not reported
    const promptTokens = Math.max(request.inputs.reduce((acc: number, str: string) => acc + Math.ceil(str.length / 4), 0), 1);

    return {
      model: request.canonicalModelId,
      embeddings,
      promptTokens,
      totalTokens: promptTokens,
      dimensions: embeddings[0]?.embedding.length || dimensions,
    };
  }

  public supportsDimensions(model: string, dimensions: number): boolean {
    return model.includes("text-embedding-004");
  }

  public supportsEncoding(encoding: "float" | "base64"): boolean {
    return encoding === "float";
  }
}
