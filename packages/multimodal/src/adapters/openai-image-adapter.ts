import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditRequest,
} from "@growx/contracts";
import type { ProviderImageAdapter } from "./provider-image-adapter.js";
import { MediaValidationError } from "../types.js";

export class OpenAIImageAdapter implements ProviderImageAdapter {
  public readonly providerId = "openai";

  public translateGenerationRequest(request: ImageGenerationRequest) {
    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      n: request.n,
      size: request.size,
      quality: request.quality,
      response_format: request.response_format,
    };

    if (request.style) {
      body.style = request.style;
    }
    if (request.user) {
      body.user = request.user;
    }

    return {
      urlPath: "/v1/images/generations",
      method: "POST" as const,
      body,
    };
  }

  public parseGenerationResponse(
    rawResponse: unknown,
    request: ImageGenerationRequest,
  ): ImageGenerationResponse {
    if (!rawResponse || typeof rawResponse !== "object") {
      throw new MediaValidationError(
        "OPENAI_IMAGE_MALFORMED",
        "OpenAI image response is not an object",
      );
    }

    const data = rawResponse as any;
    if (!Array.isArray(data.data)) {
      throw new MediaValidationError(
        "OPENAI_IMAGE_MISSING_DATA",
        "OpenAI image response missing 'data' array",
      );
    }

    return {
      created: data.created || Math.floor(Date.now() / 1000),
      data: data.data.map((item: any) => ({
        url: item.url,
        b64_json: item.b64_json,
        revised_prompt: item.revised_prompt,
      })),
      usage: {
        images_generated: data.data.length,
      },
    };
  }

  public translateEditRequest(request: ImageEditRequest) {
    return {
      urlPath: "/v1/images/edits",
      method: "POST" as const,
      body: {
        model: request.model,
        prompt: request.prompt,
        image: request.image,
        mask: request.mask,
        n: request.n,
        size: request.size,
        response_format: request.response_format,
      },
    };
  }

  public parseEditResponse(
    rawResponse: unknown,
    request: ImageEditRequest,
  ): ImageGenerationResponse {
    return this.parseGenerationResponse(rawResponse, request as any);
  }
}
