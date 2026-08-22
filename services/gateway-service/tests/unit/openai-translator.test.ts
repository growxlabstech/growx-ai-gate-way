import { describe, expect, it } from "vitest";
import {
  deriveRequiredCapabilities,
  mapToOpenAIFinishReason,
  toNormalizedGenerationRequest,
  toOpenAIChatCompletionChunk,
  toOpenAIChatCompletionResponse,
  translateOpenAIMessages,
} from "../../src/domain/openai-translator.js";

describe("OpenAI Translator Unit Tests", () => {
  it("translates basic OpenAI messages into normalized messages", () => {
    const messages = [
      { role: "system" as const, content: "You are a helpful assistant" },
      { role: "user" as const, content: "Hello there" },
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function" as const,
            function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
          },
        ],
      },
      {
        role: "tool" as const,
        tool_call_id: "call_123",
        content: '{"temp": 22}',
      },
    ];

    const normalized = translateOpenAIMessages(messages);
    expect(normalized).toHaveLength(4);
    expect(normalized[0]!.role).toBe("system");
    expect(normalized[0]!.content).toBe("You are a helpful assistant");
    expect(normalized[2]!.toolCalls).toHaveLength(1);
    expect(normalized[2]!.toolCalls![0]!.id).toBe("call_123");
    expect(normalized[3]!.toolCallId).toBe("call_123");
  });

  it("derives required capabilities from request options", () => {
    const caps1 = deriveRequiredCapabilities({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
    });
    expect(caps1).toEqual(["text.generate"]);

    const caps2 = deriveRequiredCapabilities({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
      tools: [
        {
          type: "function",
          name: "calc",
          parameters: { type: "object" },
        },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "medium",
    });
    expect(caps2).toContain("streaming");
    expect(caps2).toContain("tools.call");
    expect(caps2).toContain("structured_output");
    expect(caps2).toContain("text.reason");
  });

  it("translates structured output JSON schema in request", () => {
    const req = toNormalizedGenerationRequest(
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Extract info" }],
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "UserInfo",
            schema: {
              type: "object",
              properties: { name: { type: "string" } },
            },
            strict: true,
          },
        },
      },
      "req_123",
      "openai/gpt-4o-mini",
      "gpt-4o-mini",
    );

    expect(req.structuredOutput).toBeDefined();
    expect(req.structuredOutput?.type).toBe("json_schema");
    expect(req.structuredOutput?.name).toBe("UserInfo");
    expect(req.structuredOutput?.strict).toBe(true);
  });

  it("translates normalized response to OpenAI chat completion format", () => {
    const now = new Date();
    const openAIResp = toOpenAIChatCompletionResponse(
      {
        requestId: "req_test123",
        canonicalModelId: "openai/gpt-4o-mini",
        providerId: "openai",
        providerModelId: "gpt-4o-mini",
        output: [{ role: "assistant", content: "Generated output text" }],
        finishReason: "stop",
        usage: {
          inputTokens: 15,
          outputTokens: 10,
          totalTokens: 25,
          cachedInputTokens: 5,
          reasoningTokens: 0,
          source: "provider_reported",
        },
        timing: {
          startedAt: now,
          completedAt: new Date(now.getTime() + 50),
          latencyMs: 50,
        },
      },
      "growx/fast",
    );

    expect(openAIResp.id).toBe("chatcmpl_test123");
    expect(openAIResp.object).toBe("chat.completion");
    expect(openAIResp.model).toBe("growx/fast");
    expect(openAIResp.choices[0]!.message.content).toBe(
      "Generated output text",
    );
    expect(openAIResp.choices[0]!.finish_reason).toBe("stop");
    expect(openAIResp.usage.prompt_tokens).toBe(15);
    expect(openAIResp.usage.completion_tokens).toBe(10);
    expect(openAIResp.usage.total_tokens).toBe(25);
    expect(openAIResp.usage.prompt_tokens_details?.cached_tokens).toBe(5);
  });

  it("translates normalized stream events to OpenAI chunk format", () => {
    const chunk = toOpenAIChatCompletionChunk(
      {
        requestId: "req_test123",
        responseId: "resp_123",
        sequence: 1,
        type: "output_text.delta",
        delta: "chunk text",
        timestamp: new Date().toISOString(),
      },
      "openai/gpt-4o-mini",
      1234567890,
    );

    expect(chunk.id).toBe("chatcmpl_test123");
    expect(chunk.object).toBe("chat.completion.chunk");
    expect(chunk.choices[0]!.delta.content).toBe("chunk text");
  });

  it("maps finish reasons accurately", () => {
    expect(mapToOpenAIFinishReason("stop")).toBe("stop");
    expect(mapToOpenAIFinishReason("length")).toBe("length");
    expect(mapToOpenAIFinishReason("tool_call")).toBe("tool_calls");
    expect(mapToOpenAIFinishReason("content_filter")).toBe("content_filter");
    expect(mapToOpenAIFinishReason("error")).toBeNull();
  });
});
