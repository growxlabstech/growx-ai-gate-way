import { describe, it, expect } from 'vitest';
import { StructuredRetryController } from '../src/structured-retry.js';
import { StructuredStreamBuffer } from '../src/streaming-buffer.js';
import { StructuredOutputValidator } from '../src/validator.js';

describe('Structured Retry and Streaming Buffer', () => {
  describe('StructuredRetryController', () => {
    const controller = new StructuredRetryController({
      maxRetries: 2,
      retryOnTruncation: false,
    });

    it('retries on invalid_json within attempt limits', () => {
      expect(controller.isRetryable('invalid_json', 0)).toBe(true);
      expect(controller.isRetryable('invalid_json', 1)).toBe(true);
      expect(controller.isRetryable('invalid_json', 2)).toBe(false);
    });

    it('retries on schema_invalid within attempt limits', () => {
      expect(controller.isRetryable('schema_invalid', 0)).toBe(true);
    });

    it('never retries refusal', () => {
      expect(controller.isRetryable('refusal', 0)).toBe(false);
    });

    it('determines fallback vs same route action', () => {
      expect(controller.nextAction('invalid_json', 0, 2)).toBe('retry_fallback');
      expect(controller.nextAction('invalid_json', 0, 1)).toBe('retry_same');
      expect(controller.nextAction('refusal', 0, 2)).toBe('fail');
    });
  });

  describe('StructuredStreamBuffer', () => {
    it('buffers chunks and detects complete JSON object', () => {
      const buffer = new StructuredStreamBuffer();
      buffer.append('{"id": ');
      expect(buffer.isComplete()).toBe(false);
      buffer.append('"test", "status":');
      expect(buffer.isComplete()).toBe(false);
      buffer.append(' "ok"}');
      expect(buffer.isComplete()).toBe(true);
      expect(buffer.getAccumulated()).toBe('{"id": "test", "status": "ok"}');
    });

    it('validates accumulated buffer on completion', () => {
      const buffer = new StructuredStreamBuffer();
      const validator = new StructuredOutputValidator();
      const schema = {
        type: 'object',
        properties: { val: { type: 'number' } },
        required: ['val'],
      };

      buffer.append('{"val": 99}');
      const res = buffer.validate(validator, schema);
      expect(res.valid).toBe(true);
      expect(res.parsedOutput).toEqual({ val: 99 });
    });
  });
});
