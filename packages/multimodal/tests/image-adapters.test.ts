import { describe, it, expect } from 'vitest';
import { OpenAIImageAdapter } from '../src/adapters/openai-image-adapter.js';
import { DeterministicMultimodalAdapter } from '../src/adapters/deterministic-multimodal-adapter.js';
import type { ImageGenerationRequest, ImageEditRequest } from '@growx/contracts';

describe('Provider Image Adapters', () => {
  const genReq: ImageGenerationRequest = {
    model: 'dall-e-3',
    prompt: 'A futuristic city at sunset',
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    response_format: 'url',
    style: 'vivid',
  };

  it('OpenAI adapter translates image generation request', () => {
    const adapter = new OpenAIImageAdapter();
    const translated = adapter.translateGenerationRequest(genReq);

    expect(translated.urlPath).toBe('/v1/images/generations');
    expect(translated.body.model).toBe('dall-e-3');
    expect(translated.body.prompt).toBe('A futuristic city at sunset');
    expect(translated.body.quality).toBe('hd');
    expect(translated.body.style).toBe('vivid');
  });

  it('OpenAI adapter parses generation response', () => {
    const adapter = new OpenAIImageAdapter();
    const rawResponse = {
      created: 1700000000,
      data: [
        {
          url: 'https://oaidalleapiprodscus.blob.core.windows.net/test.png',
          revised_prompt: 'A sleek futuristic cityscape',
        },
      ],
    };

    const parsed = adapter.parseGenerationResponse(rawResponse, genReq);
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0]!.url).toBe('https://oaidalleapiprodscus.blob.core.windows.net/test.png');
    expect(parsed.data[0]!.revised_prompt).toBe('A sleek futuristic cityscape');
    expect(parsed.usage?.images_generated).toBe(1);
  });

  it('Deterministic adapter produces mock image data with valid base64', () => {
    const adapter = new DeterministicMultimodalAdapter();
    const parsed = adapter.parseGenerationResponse({}, { ...genReq, n: 2 });

    expect(parsed.data.length).toBe(2);
    expect(typeof parsed.data[0]!.b64_json).toBe('string');
    expect(parsed.data[0]!.b64_json!.length).toBeGreaterThan(0);
    expect(parsed.usage?.images_generated).toBe(2);
  });
});
