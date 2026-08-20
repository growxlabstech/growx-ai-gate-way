import { describe, it, expect } from 'vitest';
import { StructuredOutputValidator } from '../src/validator.js';

describe('StructuredOutputValidator', () => {
  const validator = new StructuredOutputValidator();

  const userSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      age: { type: 'number', minimum: 0 },
      role: { type: 'string', enum: ['admin', 'user', 'guest'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['id', 'age', 'role'],
    additionalProperties: false,
  };

  it('validates a correct JSON object against schema', () => {
    const validData = { id: 'usr_1', age: 25, role: 'admin', tags: ['lead'] };
    const result = validator.validateOutput(userSchema, validData);
    expect(result.valid).toBe(true);
    expect(result.parsedOutput).toEqual(validData);
  });

  it('detects schema violation on wrong types', () => {
    const invalidData = { id: 'usr_1', age: 'twenty-five', role: 'admin' };
    const result = validator.validateOutput(userSchema, invalidData);
    expect(result.valid).toBe(false);
    expect(result.failureCategory).toBe('schema_invalid');
    expect(result.errors && result.errors.length > 0).toBe(true);
  });

  it('detects schema violation on missing required property', () => {
    const invalidData = { id: 'usr_1', age: 30 };
    const result = validator.validateOutput(userSchema, invalidData);
    expect(result.valid).toBe(false);
    expect(result.failureCategory).toBe('schema_invalid');
  });

  it('detects schema violation on enum mismatch', () => {
    const invalidData = { id: 'usr_1', age: 30, role: 'superadmin' };
    const result = validator.validateOutput(userSchema, invalidData);
    expect(result.valid).toBe(false);
    expect(result.failureCategory).toBe('schema_invalid');
  });

  it('parses string and validates in parseAndValidate', () => {
    const jsonString = JSON.stringify({ id: 'usr_2', age: 40, role: 'user' });
    const result = validator.parseAndValidate(jsonString, userSchema);
    expect(result.valid).toBe(true);
    expect((result.parsedOutput as any).id).toBe('usr_2');
  });

  it('returns invalid_json failure category for malformed JSON string', () => {
    const brokenJson = '{ id: "usr_2", age: ';
    const result = validator.parseAndValidate(brokenJson, userSchema);
    expect(result.valid).toBe(false);
    expect(result.failureCategory).toBe('invalid_json');
  });

  it('caches compiled schemas efficiently', () => {
    for (let i = 0; i < 5; i++) {
      const result = validator.validateOutput(userSchema, { id: 'usr_' + i, age: 20 + i, role: 'guest' });
      expect(result.valid).toBe(true);
    }
  });
});
