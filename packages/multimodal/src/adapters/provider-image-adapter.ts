import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditRequest,
} from "@growx/contracts";

export interface ProviderImageAdapter {
  readonly providerId: string;

  translateGenerationRequest(request: ImageGenerationRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  };

  parseGenerationResponse(rawResponse: unknown, request: ImageGenerationRequest): ImageGenerationResponse;

  translateEditRequest?(request: ImageEditRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  };

  parseEditResponse?(rawResponse: unknown, request: ImageEditRequest): ImageGenerationResponse;
}
