import { describe, it, expect } from "vitest";
import { StreamingJsonlParser } from "../../src/domain/jsonl-parser.js";
import { BatchValidationError } from "../../src/domain/types.js";

describe("StreamingJsonlParser", () => {
  const parser = new StreamingJsonlParser();

  it("successfully parses valid JSONL lines", () => {
    const jsonl = [
      JSON.stringify({
        custom_id: "req-1",
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "hello 1" }],
        },
      }),
      JSON.stringify({
        custom_id: "req-2",
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "claude-3-5-sonnet",
          messages: [{ role: "user", content: "hello 2" }],
        },
      }),
    ].join("\n");

    const result = parser.parse(jsonl);
    expect(result.items.length).toBe(2);
    expect(result.items[0].custom_id).toBe("req-1");
    expect(result.items[1].custom_id).toBe("req-2");
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it("handles blank lines and whitespace gracefully", () => {
    const jsonl = `
      {"custom_id":"req-1","method":"POST","url":"/v1/chat/completions","body":{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}}

      {"custom_id":"req-2","method":"POST","url":"/v1/chat/completions","body":{"model":"gpt-4o","messages":[{"role":"user","content":"hi2"}]}}
    `;

    const result = parser.parse(jsonl);
    expect(result.items.length).toBe(2);
  });

  it("rejects duplicate custom_id in the same batch", () => {
    const jsonl = [
      JSON.stringify({
        custom_id: "req-duplicate",
        body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] },
      }),
      JSON.stringify({
        custom_id: "req-duplicate",
        body: { model: "gpt-4o", messages: [{ role: "user", content: "2" }] },
      }),
    ].join("\n");

    expect(() => parser.parse(jsonl)).toThrowError(BatchValidationError);
    expect(() => parser.parse(jsonl)).toThrow(
      /Duplicate custom_id 'req-duplicate'/,
    );
  });

  it("rejects invalid JSON syntax", () => {
    const jsonl = "not-valid-json";
    expect(() => parser.parse(jsonl)).toThrowError(BatchValidationError);
  });

  it("rejects line exceeding maximum line size", () => {
    const smallParser = new StreamingJsonlParser({ maxLineSizeBytes: 50 });
    const jsonl = JSON.stringify({
      custom_id: "req-1",
      body: {
        model: "gpt-4o",
        messages: [
          { role: "user", content: "some long content exceeding 50 bytes" },
        ],
      },
    });

    expect(() => smallParser.parse(jsonl)).toThrowError(BatchValidationError);
    expect(() => smallParser.parse(jsonl)).toThrow(/exceeds maximum line size/);
  });

  it("rejects empty batch (0 items)", () => {
    expect(() => parser.parse("")).toThrowError(BatchValidationError);
    expect(() => parser.parse("\n\n")).toThrowError(BatchValidationError);
  });

  it("serializes output records into valid JSONL", () => {
    const records = [
      { id: "1", custom_id: "c1", response: { status_code: 200 } },
      { id: "2", custom_id: "c2", error: { code: "fail" } },
    ];
    const out = parser.serialize(records);
    expect(out).toContain('"custom_id":"c1"');
    expect(out).toContain('"custom_id":"c2"');
    expect(out.endsWith("\n")).toBe(true);
  });
});
