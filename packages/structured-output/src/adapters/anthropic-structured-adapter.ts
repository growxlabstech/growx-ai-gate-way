import type {
  CanonicalResponseFormat,
  SchemaFeatureProfile,
  StructuredOutputCapabilities,
} from "@growx/contracts";
import type {
  ProviderStructuredOutputAdapter,
  ProviderResponseFormat,
  StructuredOutputStatus,
} from "./provider-structured-adapter.js";

export class AnthropicStructuredAdapter implements ProviderStructuredOutputAdapter {
  readonly providerId = "anthropic";

  translateResponseFormat(
    format: CanonicalResponseFormat,
    features: SchemaFeatureProfile,
  ): ProviderResponseFormat {
    // Anthropic does not natively support json_schema response_format.
    return {};
  }

  parseResponse(rawResponse: any, format: CanonicalResponseFormat): string {
    return typeof rawResponse === "string"
      ? rawResponse
      : JSON.stringify(rawResponse);
  }

  supportsSchema(
    features: SchemaFeatureProfile,
    capabilities: StructuredOutputCapabilities,
  ): boolean {
    // Does not support strict json_schema natively without lossy translation to prompt
    return false;
  }

  mapProviderFailure(error: any): StructuredOutputStatus {
    return "unknown";
  }
}
