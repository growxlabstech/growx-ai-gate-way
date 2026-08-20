import type {
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
} from "@growx/contracts";

export interface ProviderEmbeddingAdapter {
  readonly providerId: string;

  translateRequest(request: NormalizedEmbeddingRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  };

  parseResponse(
    rawResponse: unknown,
    request: NormalizedEmbeddingRequest,
    dimensions: number
  ): NormalizedEmbeddingResponse;

  supportsDimensions(model: string, dimensions: number): boolean;
  supportsEncoding(encoding: "float" | "base64"): boolean;
}
