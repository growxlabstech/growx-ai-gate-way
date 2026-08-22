import { describe, it, expect } from "vitest";
import {
  StructuredOutputValidator,
  parseStructuredOutput,
  analyzeSchemaFeatures,
  validateSchemaComplexity,
  validateSupportedSubset,
  StructuredRetryController,
  StructuredStreamBuffer,
  OpenAIStructuredAdapter,
  GeminiStructuredAdapter,
  AnthropicStructuredAdapter,
  computeResponseFormatHash,
} from "@growx/structured-output";

describe("Phase 31: Structured Output Lifecycle Integration", () => {
  const userProfileSchema = {
    type: "object",
    properties: {
      userId: { type: "string" },
      email: { type: "string", format: "email" },
      age: { type: "number", minimum: 18 },
      roles: {
        type: "array",
        items: { type: "string", enum: ["admin", "member", "guest"] },
      },
    },
    required: ["userId", "email", "age", "roles"],
    additionalProperties: false,
  };

  const validator = new StructuredOutputValidator();

  describe("Upfront Schema Validation & Feature Analysis", () => {
    it("analyzes schema features and validates complexity", () => {
      const features = analyzeSchemaFeatures(userProfileSchema);
      expect(features.propertyCount).toBe(4);
      expect(features.requiredCount).toBe(4);
      expect(features.usesEnums).toBe(true);
      expect(features.usesAdditionalPropertiesFalse).toBe(true);
      expect(features.complexityBucket).toBe("simple");

      expect(() => validateSchemaComplexity(userProfileSchema)).not.toThrow();
      expect(() =>
        validateSupportedSubset(userProfileSchema, true),
      ).not.toThrow();
    });

    it("rejects schemas with unsupported keywords in strict mode", () => {
      const unsupported = {
        type: "object",
        properties: { name: { type: "string" } },
        allOf: [{ properties: { extra: { type: "string" } } }],
      };
      expect(() => validateSupportedSubset(unsupported, true)).toThrow();
    });
  });

  describe("Deterministic Response Format Hashing for Cache Isolation", () => {
    it("produces identical hashes for identical schemas with different key orders", () => {
      const rf1 = {
        type: "json_schema" as const,
        schema: { b: 2, a: 1 },
        strict: true,
      };
      const rf2 = {
        type: "json_schema" as const,
        strict: true,
        schema: { a: 1, b: 2 },
      };
      expect(computeResponseFormatHash(rf1)).toBe(
        computeResponseFormatHash(rf2),
      );
    });

    it("produces distinct hashes for different schemas", () => {
      const rf1 = {
        type: "json_schema" as const,
        schema: { a: 1 },
        strict: true,
      };
      const rf2 = {
        type: "json_schema" as const,
        schema: { a: 2 },
        strict: true,
      };
      expect(computeResponseFormatHash(rf1)).not.toBe(
        computeResponseFormatHash(rf2),
      );
    });
  });

  describe("Local Validation Authority (GrowX validates all provider outputs)", () => {
    it("validates compliant provider output", () => {
      const rawProviderOutput = JSON.stringify({
        userId: "usr_100",
        email: "dev@growx.ai",
        age: 28,
        roles: ["admin", "member"],
      });

      const parsed = parseStructuredOutput(rawProviderOutput, "stop", {
        type: "json_schema",
      });
      expect(parsed.failureCategory).toBeUndefined();

      const validation = validator.validateOutput(
        userProfileSchema,
        parsed.parsed,
      );
      expect(validation.valid).toBe(true);
      expect(validation.parsedOutput).toEqual({
        userId: "usr_100",
        email: "dev@growx.ai",
        age: 28,
        roles: ["admin", "member"],
      });
    });

    it("catches non-conforming types (e.g. string for age instead of number)", () => {
      const rawProviderOutput = JSON.stringify({
        userId: "usr_100",
        email: "dev@growx.ai",
        age: "twenty-eight",
        roles: ["admin"],
      });

      const parsed = parseStructuredOutput(rawProviderOutput, "stop", {
        type: "json_schema",
      });
      const validation = validator.validateOutput(
        userProfileSchema,
        parsed.parsed,
      );
      expect(validation.valid).toBe(false);
      expect(validation.failureCategory).toBe("schema_invalid");
    });

    it("catches schema violations on missing required fields", () => {
      const rawProviderOutput = JSON.stringify({
        userId: "usr_100",
        email: "dev@growx.ai",
      });

      const parsed = parseStructuredOutput(rawProviderOutput, "stop", {
        type: "json_schema",
      });
      const validation = validator.validateOutput(
        userProfileSchema,
        parsed.parsed,
      );
      expect(validation.valid).toBe(false);
      expect(validation.failureCategory).toBe("schema_invalid");
    });

    it("catches enum violations", () => {
      const rawProviderOutput = JSON.stringify({
        userId: "usr_100",
        email: "dev@growx.ai",
        age: 30,
        roles: ["superadmin"],
      });

      const parsed = parseStructuredOutput(rawProviderOutput, "stop", {
        type: "json_schema",
      });
      const validation = validator.validateOutput(
        userProfileSchema,
        parsed.parsed,
      );
      expect(validation.valid).toBe(false);
    });

    it("strips markdown code blocks safely before parsing and validating", () => {
      const rawProviderOutput =
        '```json\n{\n  "userId": "usr_200",\n  "email": "user@growx.ai",\n  "age": 21,\n  "roles": ["guest"]\n}\n```';

      const parsed = parseStructuredOutput(rawProviderOutput, "stop", {
        type: "json_schema",
      });
      const validation = validator.validateOutput(
        userProfileSchema,
        parsed.parsed,
      );
      expect(validation.valid).toBe(true);
      expect((validation.parsedOutput as any).userId).toBe("usr_200");
    });

    it("detects model refusal patterns deterministically", () => {
      const refusal =
        "I'm sorry, but I cannot generate personal user data as requested.";
      const parsed = parseStructuredOutput(refusal, "stop", {
        type: "json_schema",
      });
      expect(parsed.failureCategory).toBe("refusal");
    });

    it("detects truncation on finish_reason length", () => {
      const truncated = '{"userId": "usr_300", "email": "test@';
      const parsed = parseStructuredOutput(truncated, "length", {
        type: "json_schema",
      });
      expect(parsed.failureCategory).toBe("truncated");
    });
  });

  describe("Provider Adapter Translation Boundaries", () => {
    it("OpenAI adapter produces valid json_schema parameters", () => {
      const adapter = new OpenAIStructuredAdapter();
      const features = analyzeSchemaFeatures(userProfileSchema);
      const translated = adapter.translateResponseFormat(
        {
          type: "json_schema",
          name: "UserProfile",
          schema: userProfileSchema,
          strict: true,
        },
        features,
      );

      expect(translated.type).toBe("json_schema");
      expect(translated.json_schema?.name).toBe("UserProfile");
      expect(translated.json_schema?.strict).toBe(true);
    });

    it("Gemini adapter produces responseMimeType and responseSchema", () => {
      const adapter = new GeminiStructuredAdapter();
      const features = analyzeSchemaFeatures(userProfileSchema);
      const translated = adapter.translateResponseFormat(
        {
          type: "json_schema",
          schema: userProfileSchema,
        },
        features,
      );

      expect(translated.responseMimeType).toBe("application/json");
      expect(translated.responseSchema).toEqual(userProfileSchema);
    });

    it("Anthropic adapter marks strict json_schema as unsupported natively", () => {
      const adapter = new AnthropicStructuredAdapter();
      const features = analyzeSchemaFeatures(userProfileSchema);
      expect(adapter.supportsSchema(features, {} as any)).toBe(false);
    });
  });

  describe("Structured Retry and Fallback Orchestration", () => {
    it("allows bounded retries for invalid_json and schema_invalid, but rejects refusal retries", () => {
      const retryController = new StructuredRetryController({
        maxRetries: 2,
        retryOnTruncation: false,
      });

      expect(retryController.isRetryable("invalid_json", 0)).toBe(true);
      expect(retryController.isRetryable("schema_invalid", 0)).toBe(true);
      expect(retryController.isRetryable("refusal", 0)).toBe(false);
      expect(retryController.isRetryable("truncated", 0)).toBe(false);

      // Exceeded limit
      expect(retryController.isRetryable("schema_invalid", 2)).toBe(false);
    });
  });

  describe("Streaming Structured Output Buffer Mode", () => {
    it("buffers incoming chunks, detects completion, and validates accumulated payload", () => {
      const streamBuffer = new StructuredStreamBuffer();
      streamBuffer.append('{"userId": "usr_stream",');
      expect(streamBuffer.isComplete()).toBe(false);

      streamBuffer.append(' "email": "stream@growx.ai",');
      expect(streamBuffer.isComplete()).toBe(false);

      streamBuffer.append(' "age": 33, "roles": ["member"]}');
      expect(streamBuffer.isComplete()).toBe(true);

      const validation = streamBuffer.validate(validator, userProfileSchema);
      expect(validation.valid).toBe(true);
      expect(validation.parsedOutput).toEqual({
        userId: "usr_stream",
        email: "stream@growx.ai",
        age: 33,
        roles: ["member"],
      });
    });
  });
});
