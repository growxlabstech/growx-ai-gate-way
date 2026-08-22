import type {
  CanonicalResponseFormat,
  SchemaFeatureProfile,
  StructuredOutputCapabilities,
} from "@growx/contracts";

export type StructuredOutputStatus =
  | "success"
  | "invalid_json"
  | "schema_invalid"
  | "refusal"
  | "truncated"
  | "unknown";

export interface ProviderResponseFormat {
  [key: string]: any;
}

export interface ProviderStructuredOutputAdapter {
  readonly providerId: string;
  translateResponseFormat(
    format: CanonicalResponseFormat,
    features: SchemaFeatureProfile,
  ): ProviderResponseFormat;
  parseResponse(rawResponse: unknown, format: CanonicalResponseFormat): string;
  supportsSchema(
    features: SchemaFeatureProfile,
    capabilities: StructuredOutputCapabilities,
  ): boolean;
  mapProviderFailure(error: unknown): StructuredOutputStatus;
}
