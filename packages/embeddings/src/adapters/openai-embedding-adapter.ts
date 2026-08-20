import type {
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
} from "@growx/contracts";
import type { ProviderEmbeddingAdapter } from "./provider-embedding-adapter.js";
import { decodeBase64ToFloat32 } from "../encoding.js";
import { EmbeddingProviderInvalidResponseError } from "../types.js";

export class OpenAIEmbeddingAdapter implements ProviderEmbeddingAdapter {
  public readonly providerId = "openai";

  public translateRequest(request: NormalizedEmbeddingRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  } {
    const body: Record<string, unknown> = {
      model: request.providerModelId,
      input: request.inputs.length === 1 ? request.inputs[0] : request.inputs,
      encoding_format: request.encodingFormat,
    };

    if (request.dimensions !== undefined) {
      body.dimensions = request.dimensions;
    }

    if (request.user) {
      body.user = request.user;
    }

    return {
      urlPath: "/v1/embeddings",
      method: "POST",
      body,
    };
  }

  public parseResponse(
    rawResponse: unknown,
    request: NormalizedEmbeddingRequest,
    dimensions: number
  ): NormalizedEmbeddingResponse {
    if (!rawResponse || typeof rawResponse !== "object") {
      throw new EmbeddingProviderInvalidResponseError(
        "OPENAI_MALFORMED_RESPONSE",
        "OpenAI embeddings response is not a valid JSON object"
      );
    }

    const data = rawResponse as any;
    if (!Array.isArray(data.data)) {
      throw new EmbeddingProviderInvalidResponseError(
        "OPENAI_MISSING_DATA",
        "OpenAI response is missing 'data' array"
      );
    }

    const embeddings = data.data.map((item: any) => {
      let vec: number[];
      let base64: string | undefined;

      if (typeof item.embedding === "string") {
        base64 = item.embedding;
        vec = decodeBase64ToFloat32(item.embedding);
      } else if (Array.isArray(item.embedding)) {
        vec = item.embedding;
      } else {
        throw new EmbeddingProviderInvalidResponseError(
          "OPENAI_INVALID_EMBEDDING",
          `Item at index ${item.index} has invalid embedding format`
        );
      }

      return {
        index: item.index,
        embedding: vec,
        base64Embedding: base64,
      };
    });

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? promptTokens;

    return {
      model: data.model || request.canonicalModelId,
      embeddings,
      promptTokens,
      totalTokens,
      dimensions,
      rawUsage: data.usage,
    };
  }

  public supportsDimensions(model: string, dimensions: number): boolean {
    return model.includes("text-embedding-3");
  }

  public supportsEncoding(encoding: "float" | "base64"): boolean {
    return true;
  }
}
