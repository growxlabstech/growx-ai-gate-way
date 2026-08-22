import {
  type CanonicalCapability,
  GrowXProviderError,
  type NormalizedGenerationRequest,
} from "@growx/contracts";

export function validateRequestCapabilities(
  request: NormalizedGenerationRequest,
  supportedCapabilities: CanonicalCapability[],
): void {
  const capSet = new Set<string>(supportedCapabilities);

  // 1. Streaming
  if (request.stream && !capSet.has("streaming")) {
    throw new GrowXProviderError(
      "model_capability_not_supported",
      `Model route '${request.providerModelId}' does not support streaming`,
      false,
      400,
    );
  }

  // 2. Tools
  if (request.tools && request.tools.length > 0 && !capSet.has("tools.call")) {
    throw new GrowXProviderError(
      "model_capability_not_supported",
      `Model route '${request.providerModelId}' does not support tool calling`,
      false,
      400,
    );
  }

  // 3. Structured Output
  if (request.structuredOutput && !capSet.has("structured_output")) {
    throw new GrowXProviderError(
      "model_capability_not_supported",
      `Model route '${request.providerModelId}' does not support structured output`,
      false,
      400,
    );
  }

  // 4. Reasoning
  if (request.reasoning && !capSet.has("text.reason")) {
    throw new GrowXProviderError(
      "model_capability_not_supported",
      `Model route '${request.providerModelId}' does not support reasoning effort configuration`,
      false,
      400,
    );
  }

  // 5. Vision input
  const hasImage = request.messages.some(
    (m) =>
      Array.isArray(m.content) && m.content.some((c) => c.type === "image_url"),
  );
  if (hasImage && !capSet.has("vision.input")) {
    throw new GrowXProviderError(
      "model_capability_not_supported",
      `Model route '${request.providerModelId}' does not support multimodal image input`,
      false,
      400,
    );
  }
}
