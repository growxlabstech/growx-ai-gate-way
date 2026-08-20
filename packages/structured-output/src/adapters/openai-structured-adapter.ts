import type { CanonicalResponseFormat, SchemaFeatureProfile, StructuredOutputCapabilities } from '@growx/contracts';
import type { ProviderStructuredOutputAdapter, ProviderResponseFormat, StructuredOutputStatus } from './provider-structured-adapter.js';

export class OpenAIStructuredAdapter implements ProviderStructuredOutputAdapter {
  readonly providerId = 'openai';

  translateResponseFormat(format: CanonicalResponseFormat, features: SchemaFeatureProfile): ProviderResponseFormat {
    if (format.type === 'json_schema' && format.schema) {
      return {
        type: 'json_schema',
        json_schema: {
          name: format.name || 'response',
          schema: format.schema,
          strict: format.strict !== false
        }
      };
    }
    if (format.type === 'json_object') {
      return { type: 'json_object' };
    }
    return {};
  }

  parseResponse(rawResponse: any, format: CanonicalResponseFormat): string {
    return typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
  }

  supportsSchema(features: SchemaFeatureProfile, capabilities: StructuredOutputCapabilities): boolean {
    return true; // OpenAI natively supports json_schema and json_object
  }

  mapProviderFailure(error: any): StructuredOutputStatus {
    if (error?.code === 'length') return 'truncated';
    return 'unknown';
  }
}
