import { describe, it, expect } from 'vitest';
import { OpenAIEmbeddingAdapter } from '../src/adapters/openai-embedding-adapter.js';
import { GeminiEmbeddingAdapter } from '../src/adapters/gemini-embedding-adapter.js';
import { DeterministicEmbeddingAdapter } from '../src/adapters/deterministic-embedding-adapter.js';
import type { NormalizedEmbeddingRequest } from '@growx/contracts';

describe('Provider Embedding Adapters', () => {
  const req: NormalizedEmbeddingRequest = {
    requestId: 'req_123',
    canonicalModelId: 'openai/text-embedding-3-small',
    providerModelId: 'text-embedding-3-small',
    inputs: ['hello world', 'growx ai'],
    dimensions: 512,
    encodingFormat: 'float',
    timeoutMs: 30000,
  };

  it('OpenAI adapter translates request and parses response', () => {
    const adapter = new OpenAIEmbeddingAdapter();
    const translated = adapter.translateRequest(req);
    expect(translated.urlPath).toBe('/v1/embeddings');
    expect(translated.body.model).toBe('text-embedding-3-small');
    expect(translated.body.dimensions).toBe(512);
    expect(translated.body.input).toEqual(['hello world', 'growx ai']);

    const rawResponse = {
      model: 'text-embedding-3-small',
      data: [
        { index: 0, embedding: Array(512).fill(0.1) },
        { index: 1, embedding: Array(512).fill(0.2) },
      ],
      usage: { prompt_tokens: 6, total_tokens: 6 },
    };

    const parsed = adapter.parseResponse(rawResponse, req, 512);
    expect(parsed.embeddings.length).toBe(2);
    expect(parsed.promptTokens).toBe(6);
    expect(parsed.dimensions).toBe(512);
  });

  it('Gemini adapter translates request and parses response', () => {
    const adapter = new GeminiEmbeddingAdapter();
    const geminiReq: NormalizedEmbeddingRequest = {
      ...req,
      canonicalModelId: 'google/text-embedding-004',
      providerModelId: 'text-embedding-004',
      dimensions: 768,
    };
    const translated = adapter.translateRequest(geminiReq);
    expect(translated.urlPath).toContain(':batchEmbedContents');

    const rawResponse = {
      embeddings: [
        { values: Array(768).fill(0.05) },
        { values: Array(768).fill(0.08) },
      ],
    };
    const parsed = adapter.parseResponse(rawResponse, geminiReq, 768);
    expect(parsed.embeddings.length).toBe(2);
    expect(parsed.embeddings[0]!.embedding.length).toBe(768);
  });

  it('Deterministic adapter generates normalized unit vectors', () => {
    const adapter = new DeterministicEmbeddingAdapter(256);
    const parsed = adapter.parseResponse({}, req, 256);
    expect(parsed.embeddings.length).toBe(2);
    expect(parsed.embeddings[0]!.embedding.length).toBe(512);

    // Verify L2 norm ~ 1.0
    const vec = parsed.embeddings[0]!.embedding;
    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });
});
