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

export class GeminiStructuredAdapter implements ProviderStructuredOutputAdapter {
  readonly providerId = "gemini";

  translateResponseFormat(
    format: CanonicalResponseFormat,
    features: SchemaFeatureProfile,
  ): ProviderResponseFormat {
    if (format.type === "json_schema" || format.type === "json_object") {
      const res: any = { responseMimeType: "application/json" };
      if (format.type === "json_schema" && format.schema) {
        res.responseSchema = format.schema;
      }
      return res;
    }
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
    return true;
  }

  mapProviderFailure(error: any): StructuredOutputStatus {
    return "unknown";
  }
}
