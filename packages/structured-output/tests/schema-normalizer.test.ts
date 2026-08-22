import { describe, it, expect } from "vitest";
import {
  normalizeSchema,
  computeSchemaHash,
  computeResponseFormatHash,
} from "../src/schema-normalizer.js";

describe("Schema Normalizer", () => {
  it("produces deterministic output and identical hashes regardless of key order", () => {
    const schema1 = { b: 2, a: 1, nested: { z: 9, y: 8 } };
    const schema2 = { a: 1, nested: { y: 8, z: 9 }, b: 2 };

    const hash1 = computeSchemaHash(schema1);
    const hash2 = computeSchemaHash(schema2);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBe(64);
  });

  it("computes distinct hashes for different response formats", () => {
    const rf1 = {
      type: "json_schema",
      schema: { type: "object", properties: { x: { type: "string" } } },
      strict: true,
    };
    const rf2 = {
      type: "json_schema",
      schema: { type: "object", properties: { x: { type: "number" } } },
      strict: true,
    };
    const rf3 = { type: "json_object" };

    expect(computeResponseFormatHash(rf1)).not.toBe(
      computeResponseFormatHash(rf2),
    );
    expect(computeResponseFormatHash(rf1)).not.toBe(
      computeResponseFormatHash(rf3),
    );
  });
});
