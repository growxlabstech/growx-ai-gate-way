import { describe, it, expect } from "vitest";
import {
  serializeChunk,
  serializeDone,
  serializeHeartbeat,
  serializeStreamError,
} from "../../src/transport/sse-serializer.js";

describe("SSE Serializer", () => {
  describe("serializeChunk", () => {
    it("serializes an OpenAI chunk as SSE data frame", () => {
      const chunk = {
        id: "chatcmpl_test",
        object: "chat.completion.chunk" as const,
        created: 1234567890,
        model: "openai/gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: { content: "Hello" },
          },
        ],
      };

      const result = serializeChunk(chunk);
      expect(result).toBe(`data: ${JSON.stringify(chunk)}\n\n`);
    });

    it("preserves UTF-8 emoji in chunk content", () => {
      const chunk = {
        id: "chatcmpl_emoji",
        object: "chat.completion.chunk" as const,
        created: 1234567890,
        model: "openai/gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: { content: "Hello 🌍🚀✨" },
          },
        ],
      };

      const result = serializeChunk(chunk);
      expect(result).toContain("🌍🚀✨");
      expect(result).toMatch(/^data: .+\n\n$/);
    });

    it("preserves multi-byte Indian language text", () => {
      const chunk = {
        id: "chatcmpl_hindi",
        object: "chat.completion.chunk" as const,
        created: 1234567890,
        model: "openai/gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: { content: "नमस्ते दुनिया" },
          },
        ],
      };

      const result = serializeChunk(chunk);
      expect(result).toContain("नमस्ते दुनिया");
      const parsed = JSON.parse(result.replace("data: ", "").trim());
      expect(parsed.choices[0].delta.content).toBe("नमस्ते दुनिया");
    });

    it("handles empty delta content", () => {
      const chunk = {
        id: "chatcmpl_empty",
        object: "chat.completion.chunk" as const,
        created: 1234567890,
        model: "openai/gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: { role: "assistant" as const },
          },
        ],
      };

      const result = serializeChunk(chunk);
      expect(result).toMatch(/^data: /);
      expect(result).toMatch(/\n\n$/);
    });

    it("includes usage in chunk when present", () => {
      const chunk = {
        id: "chatcmpl_usage",
        object: "chat.completion.chunk" as const,
        created: 1234567890,
        model: "openai/gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop" as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = serializeChunk(chunk);
      const parsed = JSON.parse(result.replace("data: ", "").trim());
      expect(parsed.usage.prompt_tokens).toBe(10);
      expect(parsed.usage.completion_tokens).toBe(5);
    });
  });

  describe("serializeDone", () => {
    it("returns the SSE [DONE] marker", () => {
      expect(serializeDone()).toBe("data: [DONE]\n\n");
    });
  });

  describe("serializeHeartbeat", () => {
    it("returns an SSE comment ping", () => {
      expect(serializeHeartbeat()).toBe(": ping\n\n");
    });

    it("starts with colon (SSE comment)", () => {
      expect(serializeHeartbeat()).toMatch(/^:/);
    });
  });

  describe("serializeStreamError", () => {
    it("returns a JSON error event followed by [DONE]", () => {
      const result = serializeStreamError("provider_timeout", "Request timed out", "req_abc123");
      expect(result).toContain("data: ");
      expect(result).toContain("data: [DONE]");
      expect(result).toContain('"provider_timeout"');
      expect(result).toContain('"req_abc123"');
    });

    it("produces valid JSON in the error data frame", () => {
      const result = serializeStreamError("internal_error", "Something went wrong", "req_xyz");
      const lines = result.split("\n\n").filter((l) => l.startsWith("data: "));
      const errorLine = lines[0]!;
      const jsonStr = errorLine.replace("data: ", "");
      const parsed = JSON.parse(jsonStr);
      expect(parsed.error.type).toBe("api_error");
      expect(parsed.error.code).toBe("internal_error");
      expect(parsed.error.message).toBe("Something went wrong");
      expect(parsed.error.requestId).toBe("req_xyz");
    });
  });
});
