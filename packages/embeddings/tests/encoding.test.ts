import { describe, it, expect } from "vitest";
import {
  encodeFloat32ToBase64,
  decodeBase64ToFloat32,
  formatVectorOutput,
} from "../src/encoding.js";

describe("Embedding Encoding (IEEE 754 Float32 & Base64)", () => {
  it("encodes float vector to base64 and decodes back with float32 fidelity", () => {
    const original = [0.125, -0.5, 1.0, 0.0, -2.75];
    const base64 = encodeFloat32ToBase64(original);
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);

    const decoded = decodeBase64ToFloat32(base64);
    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBeCloseTo(original[i]!, 5);
    }
  });

  it("formatVectorOutput returns numeric array for float format", () => {
    const vec = [1.0, 2.0, 3.0];
    const out = formatVectorOutput(vec, "float");
    expect(out).toEqual(vec);
  });

  it("formatVectorOutput returns base64 string for base64 format", () => {
    const vec = [1.0, 2.0, 3.0];
    const out = formatVectorOutput(vec, "base64");
    expect(typeof out).toBe("string");
  });
});
