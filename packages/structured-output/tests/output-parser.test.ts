import { describe, it, expect } from "vitest";
import { parseStructuredOutput } from "../src/output-parser.js";

describe("Output Parser", () => {
  it("parses clean JSON", () => {
    const res = parseStructuredOutput('{"count": 42}', "stop", {
      type: "json_object",
    });
    expect(res.failureCategory).toBeUndefined();
    expect(res.parsed).toEqual({ count: 42 });
  });

  it("strips markdown json fences safely", () => {
    const withFences = '```json\n{\n  "message": "hello"\n}\n```';
    const res = parseStructuredOutput(withFences, "stop", {
      type: "json_object",
    });
    expect(res.parsed).toEqual({ message: "hello" });
  });

  it("strips standard markdown fences safely", () => {
    const withFences = '```\n{"val": true}\n```';
    const res = parseStructuredOutput(withFences, "stop", {
      type: "json_object",
    });
    expect(res.parsed).toEqual({ val: true });
  });

  it("detects model refusal", () => {
    const refusal = "I'm sorry, but I can't fulfill this request.";
    const res = parseStructuredOutput(refusal, "stop", { type: "json_object" });
    expect(res.failureCategory).toBe("refusal");
  });

  it("detects truncation on finish_reason length", () => {
    const partial = '{"name": "partial';
    const res = parseStructuredOutput(partial, "length", {
      type: "json_object",
    });
    expect(res.failureCategory).toBe("truncated");
  });

  it("handles empty content", () => {
    const res = parseStructuredOutput("", "stop", { type: "json_object" });
    expect(res.failureCategory).toBe("invalid_json");
  });
});
