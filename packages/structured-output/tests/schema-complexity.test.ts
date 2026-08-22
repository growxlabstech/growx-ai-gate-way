import { describe, it, expect } from "vitest";
import {
  validateSchemaComplexity,
  SchemaComplexityError,
} from "../src/schema-complexity.js";

describe("Schema Complexity Limits", () => {
  it("passes schemas within reasonable limits", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
    };
    expect(() => validateSchemaComplexity(schema)).not.toThrow();
  });

  it("throws SchemaComplexityError when property limit is exceeded", () => {
    const properties: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      properties["prop_" + i] = { type: "string" };
    }
    const wideSchema = { type: "object", properties };

    expect(() =>
      validateSchemaComplexity(wideSchema, {
        maxSchemaBytes: 65536,
        maxDepth: 10,
        maxProperties: 10,
        maxRequiredCount: 50,
        maxEnumValues: 50,
        maxArrayNesting: 3,
        maxUnionBranches: 5,
        maxPatternLength: 100,
        maxOutputBytes: 100000,
      }),
    ).toThrow(SchemaComplexityError);
  });
});
