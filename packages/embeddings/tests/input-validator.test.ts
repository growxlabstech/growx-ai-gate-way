import { describe, it, expect } from 'vitest';
import {
  normalizeEmbeddingInput,
  validateEmbeddingInput,
  estimateInputTokens,
} from '../src/input-validator.js';
import { EmbeddingValidationError } from '../src/types.js';

describe('Embedding Input Validator', () => {
  const defaultLimits = {
    maxBatchItems: 10,
    maxInputTokensPerItem: 100,
    maxTotalTokensPerRequest: 500,
    maxTotalBytesPerRequest: 10_000,
  };

  it('normalizes single string to array', () => {
    const res = normalizeEmbeddingInput('hello world');
    expect(res).toEqual(['hello world']);
  });

  it('normalizes string array', () => {
    const res = normalizeEmbeddingInput(['first', 'second', 'third']);
    expect(res).toEqual(['first', 'second', 'third']);
  });

  it('rejects empty string input', () => {
    expect(() => normalizeEmbeddingInput('')).toThrow(EmbeddingValidationError);
    expect(() => normalizeEmbeddingInput('   ')).toThrow(EmbeddingValidationError);
  });

  it('rejects empty array input', () => {
    expect(() => normalizeEmbeddingInput([])).toThrow(EmbeddingValidationError);
  });

  it('rejects array containing empty string items', () => {
    expect(() => normalizeEmbeddingInput(['valid', ''])).toThrow(EmbeddingValidationError);
  });

  it('estimates input tokens reasonably', () => {
    expect(estimateInputTokens('hello')).toBeGreaterThanOrEqual(1);
    expect(estimateInputTokens('this is a longer sentence with several words')).toBeGreaterThanOrEqual(7);
  });

  it('enforces maximum batch item limits', () => {
    const items = Array.from({ length: 15 }, (_, i) => 'item ' + i);
    expect(() => validateEmbeddingInput(items, defaultLimits)).toThrow(EmbeddingValidationError);
  });

  it('enforces per-item token limits', () => {
    const longItem = 'word '.repeat(300);
    expect(() => validateEmbeddingInput([longItem], defaultLimits)).toThrow(EmbeddingValidationError);
  });

  it('calculates total estimated tokens and bytes correctly', () => {
    const inputs = ['one', 'two', 'three'];
    const { totalEstimatedTokens, totalBytes } = validateEmbeddingInput(inputs, defaultLimits);
    expect(totalEstimatedTokens).toBeGreaterThanOrEqual(3);
    expect(totalBytes).toBe(11);
  });
});
