import { describe, it, expect } from 'vitest';
import { OpenAIStructuredAdapter } from '../src/adapters/openai-structured-adapter.js';
import { AnthropicStructuredAdapter } from '../src/adapters/anthropic-structured-adapter.js';
import { GeminiStructuredAdapter } from '../src/adapters/gemini-structured-adapter.js';
import { analyzeSchemaFeatures } from '../src/schema-analyzer.js';

describe('Provider Structured Output Adapters', () => {
  const schema = {
    type: 'object',
    properties: { result: { type: 'string' } },
    required: ['result'],
  };
  const features = analyzeSchemaFeatures(schema);

  it('OpenAI adapter translates json_schema and json_object', () => {
    const adapter = new OpenAIStructuredAdapter();

    const translatedSchema = adapter.translateResponseFormat(
      { type: 'json_schema', name: 'my_output', schema, strict: true },
      features
    );
    expect(translatedSchema.type).toBe('json_schema');
    expect(translatedSchema.json_schema?.name).toBe('my_output');
    expect(translatedSchema.json_schema?.strict).toBe(true);

    const translatedObj = adapter.translateResponseFormat({ type: 'json_object' }, features);
    expect(translatedObj.type).toBe('json_object');
  });

  it('Anthropic adapter returns empty/lossy for unsupported strict json_schema', () => {
    const adapter = new AnthropicStructuredAdapter();
    const supports = adapter.supportsSchema(features, {} as any);
    expect(supports).toBe(false);
  });

  it('Gemini adapter translates to responseMimeType and responseSchema', () => {
    const adapter = new GeminiStructuredAdapter();
    const translated = adapter.translateResponseFormat(
      { type: 'json_schema', schema },
      features
    );
    expect(translated.responseMimeType).toBe('application/json');
    expect(translated.responseSchema).toEqual(schema);
  });
});
