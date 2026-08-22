import { describe, it, expect } from "vitest";
import { analyzeSchemaFeatures } from "../src/schema-analyzer.js";

describe("Schema Analyzer", () => {
  it("analyzes simple schema features", () => {
    const schema = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id"],
    };

    const profile = analyzeSchemaFeatures(schema);
    expect(profile.propertyCount).toBe(2);
    expect(profile.requiredCount).toBe(1);
    expect(profile.depth).toBeGreaterThanOrEqual(1);
    expect(profile.complexityBucket).toBe("simple");
  });

  it("analyzes nested and complex schema features", () => {
    const complexSchema = {
      type: "object",
      properties: {
        users: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", pattern: "^[0-9]+$" },
              status: { enum: ["active", "inactive", "pending"] },
              nestedArray: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    };

    const profile = analyzeSchemaFeatures(complexSchema);
    expect(profile.usesEnums).toBe(true);
    expect(profile.enumValueCount).toBe(3);
    expect(profile.usesPatterns).toBe(true);
    expect(profile.patternLength).toBeGreaterThan(0);
    expect(profile.usesNestedArrays).toBe(true);
  });
});
