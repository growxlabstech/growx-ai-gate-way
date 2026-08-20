import { describe, it, expect } from 'vitest';
import { EmbeddingResponseValidator } from '../src/response-validator.js';
import { EmbeddingProviderInvalidResponseError } from '../src/types.js';

describe('Embedding Response Validator', () => {
  it('validates a correct provider response', () => {
    const validItems = [
      { index: 0, embedding: [0.1, 0.2, 0.3] },
      { index: 1, embedding: [0.4, 0.5, 0.6] },
    ];
    expect(() => EmbeddingResponseValidator.validate(validItems, 2, 3)).not.toThrow();
  });

  it('rejects provider response with count mismatch', () => {
    const items = [{ index: 0, embedding: [0.1, 0.2, 0.3] }];
    expect(() => EmbeddingResponseValidator.validate(items, 2, 3)).toThrow(
      EmbeddingProviderInvalidResponseError
    );
  });

  it('rejects provider response with duplicate index', () => {
    const items = [
      { index: 0, embedding: [0.1, 0.2, 0.3] },
      { index: 0, embedding: [0.4, 0.5, 0.6] },
    ];
    expect(() => EmbeddingResponseValidator.validate(items, 2, 3)).toThrow(
      EmbeddingProviderInvalidResponseError
    );
  });

  it('rejects provider response with dimension mismatch', () => {
    const items = [
      { index: 0, embedding: [0.1, 0.2] }, // only 2 dims, expected 3
      { index: 1, embedding: [0.4, 0.5, 0.6] },
    ];
    expect(() => EmbeddingResponseValidator.validate(items, 2, 3)).toThrow(
      EmbeddingProviderInvalidResponseError
    );
  });

  it('rejects non-finite values (NaN)', () => {
    const items = [{ index: 0, embedding: [0.1, NaN, 0.3] }];
    expect(() => EmbeddingResponseValidator.validate(items, 1, 3)).toThrow(
      EmbeddingProviderInvalidResponseError
    );
  });

  it('rejects non-finite values (Infinity)', () => {
    const items = [{ index: 0, embedding: [0.1, Infinity, 0.3] }];
    expect(() => EmbeddingResponseValidator.validate(items, 1, 3)).toThrow(
      EmbeddingProviderInvalidResponseError
    );
  });

  it('sorts response items by index deterministically', () => {
    const unordered = [
      { index: 2, val: 'c' },
      { index: 0, val: 'a' },
      { index: 1, val: 'b' },
    ];
    const sorted = EmbeddingResponseValidator.sortByIndex(unordered);
    expect(sorted.map((x) => x.index)).toEqual([0, 1, 2]);
  });
});
