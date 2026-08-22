import { describe, it, expect } from "vitest";
import {
  validateSupportedSubset,
  UnsupportedSchemaKeywordError,
} from "../src/supported-subset.js";

describe("Supported JSON Schema Subset", () => {
  it("allows supported keywords without error", () => {
    const validSchema = {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 50,
          pattern: "^[a-z]+$",
        },
        score: { type: "number", minimum: 0, maximum: 100 },
        tags: { type: "array", items: { type: "string" } },
        choice: { enum: ["a", "b"] },
      },
      required: ["name"],
      additionalProperties: false,
    };

    expect(() => validateSupportedSubset(validSchema, true)).not.toThrow();
  });

  it("throws UnsupportedSchemaKeywordError in strict mode for disallowed keywords", () => {
    const unsupportedSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      allOf: [{ properties: { age: { type: "number" } } }],
    };

    expect(() => validateSupportedSubset(unsupportedSchema, true)).toThrow(
      UnsupportedSchemaKeywordError,
    );
  });

  it("returns warnings in non-strict mode for disallowed keywords", () => {
    const unsupportedSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      $comment: "internal notes",
    };

    const warnings = validateSupportedSubset(unsupportedSchema, false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("$comment");
  });
});
