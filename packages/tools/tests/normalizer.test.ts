import { describe, it, expect } from "vitest";
import { ToolCallNormalizer } from "../src/normalizer.js";
import type { CanonicalToolDefinition } from "@growx/contracts";

describe("Tool Call Normalizer", () => {
  const normalizer = new ToolCallNormalizer();
  const weatherTool: CanonicalToolDefinition = {
    name: "get_weather",
    description: "Get current weather",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
    strict: true,
    metadata: {},
  };

  it("normalizes and validates raw tool call JSON string", () => {
    const raw = {
      id: "call_abc123",
      name: "get_weather",
      arguments: '{"city":"Tokyo","unit":"celsius"}',
    };

    const normalized = normalizer.normalizeToolCall(raw, [weatherTool], "req_123");
    expect(normalized.id).toBeDefined();
    expect(normalized.name).toBe("get_weather");
    expect(normalized.arguments).toEqual({ city: "Tokyo", unit: "celsius" });
    expect(normalized.status).toBe("validated");
    expect(normalized.argumentsHash).toBeDefined();
  });

  it("rejects unknown tool not present in allowed tool definitions", () => {
    const raw = {
      id: "call_unknown",
      name: "delete_database",
      arguments: '{"db":"prod"}',
    };

    expect(() => {
      normalizer.normalizeToolCall(raw, [weatherTool], "req_123");
    }).toThrow(/unknown or not authorized/);
  });

  it("rejects malformed JSON arguments", () => {
    const raw = {
      id: "call_malformed",
      name: "get_weather",
      arguments: '{"city": "Paris", invalid_json',
    };

    expect(() => {
      normalizer.normalizeToolCall(raw, [weatherTool], "req_123");
    }).toThrow(/Invalid JSON/);
  });
});
