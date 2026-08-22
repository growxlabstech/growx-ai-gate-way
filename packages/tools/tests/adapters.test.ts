import { describe, it, expect } from "vitest";
import { OpenAIToolAdapter } from "../src/adapters/openai-tool-adapter.js";
import { AnthropicToolAdapter } from "../src/adapters/anthropic-tool-adapter.js";
import { GeminiToolAdapter } from "../src/adapters/gemini-tool-adapter.js";
import type { CanonicalToolDefinition } from "@growx/contracts";

describe("Provider Tool Adapters (OpenAI, Anthropic, Gemini)", () => {
  const tool: CanonicalToolDefinition = {
    name: "calculator",
    description: "Evaluate arithmetic",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    strict: true,
    metadata: {},
  };

  it("OpenAI adapter translates tools and parses tool calls", () => {
    const adapter = new OpenAIToolAdapter();
    const translated = adapter.translateTools([tool]) as any[];
    expect(translated[0].type).toBe("function");
    expect(translated[0].function.name).toBe("calculator");

    const rawResponse = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "calculator",
                  arguments: '{"expression":"2+2"}',
                },
              },
            ],
          },
        },
      ],
    };

    const parsed = adapter.parseToolCalls(rawResponse, "req_1");
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("calculator");
    expect(parsed[0].arguments).toEqual({ expression: "2+2" });
  });

  it("Anthropic adapter translates tools and parses tool_use blocks", () => {
    const adapter = new AnthropicToolAdapter();
    const translated = adapter.translateTools([tool]) as any[];
    expect(translated[0].name).toBe("calculator");
    expect(translated[0].input_schema).toBeDefined();

    const rawResponse = {
      content: [
        {
          type: "tool_use",
          id: "toolu_456",
          name: "calculator",
          input: { expression: "10*5" },
        },
      ],
    };

    const parsed = adapter.parseToolCalls(rawResponse, "req_2");
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("calculator");
    expect(parsed[0].arguments).toEqual({ expression: "10*5" });
  });

  it("Gemini adapter translates functionDeclarations and parses functionCall parts", () => {
    const adapter = new GeminiToolAdapter();
    const translated = adapter.translateTools([tool]) as any[];
    expect(translated[0].functionDeclarations[0].name).toBe("calculator");

    const rawResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "calculator",
                  args: { expression: "100/4" },
                },
              },
            ],
          },
        },
      ],
    };

    const parsed = adapter.parseToolCalls(rawResponse, "req_3");
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("calculator");
    expect(parsed[0].arguments).toEqual({ expression: "100/4" });
  });
});
