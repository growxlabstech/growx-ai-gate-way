/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { OpenAIAdapter } from "@growx/provider-sdk";
import type {
  NormalizedGenerationRequest,
  ProviderExecutionContext,
} from "@growx/contracts";
import http from "node:http";

describe("OpenAIAdapter Unit Tests", () => {
  const adapter = new OpenAIAdapter("openai");

  it("extracts cached and reasoning tokens correctly", () => {
    const rawUsage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 25 },
    };

    const usage = adapter.extractUsage(rawUsage);
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
    expect(usage.cachedInputTokens).toBe(40);
    expect(usage.reasoningTokens).toBe(25);
    expect(usage.source).toBe("provider_reported");
  });

  it("executes non-streaming request against mock server and normalizes response", async () => {
    let capturedBody: any = null;
    let capturedAuth: string | undefined = undefined;

    const server = http.createServer((req, res) => {
      capturedAuth = req.headers["authorization"];
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        capturedBody = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-123",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Hello from mock OpenAI!",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
            },
          })
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_openai_1",
      canonicalModelId: "openai/gpt-4o",
      providerModelId: "gpt-4o-2024-08-06",
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Say hello" }],
      temperature: 0.7,
      maxOutputTokens: 100,
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "openai",
      providerRouteId: "gpt-4o-2024-08-06",
      credentialId: "pcred_123",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "sk-test-mock-key-123",
    };
    (context as any).baseUrl = baseUrl;

    try {
      const response = await adapter.execute(request, context);

      expect(response.requestId).toBe(request.requestId);
      expect(response.providerId).toBe("openai");
      expect(response.providerModelId).toBe("gpt-4o-2024-08-06");
      expect(response.output[0]?.content).toBe("Hello from mock OpenAI!");
      expect(response.finishReason).toBe("stop");
      expect(response.usage.inputTokens).toBe(12);
      expect(response.usage.outputTokens).toBe(8);

      expect(capturedAuth).toBe("Bearer sk-test-mock-key-123");
      expect(capturedBody.messages[0]?.role).toBe("system");
      expect(capturedBody.messages[0]?.content).toBe("You are a helpful assistant.");
      expect(capturedBody.messages[1]?.role).toBe("user");
      expect(capturedBody.messages[1]?.content).toBe("Say hello");
    } finally {
      server.close();
    }
  });

  it("handles streaming request with SSE events and delta generation", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });

      const chunks = [
        `data: {"choices":[{"delta":{"content":"Hel"}}] }\n\n`,
        `data: {"choices":[{"delta":{"content":"lo "}}] }\n\n`,
        `data: {"choices":[{"delta":{"content":"world!"}}] }\n\n`,
        `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
        `data: [DONE]\n\n`,
      ];

      for (const chunk of chunks) {
        res.write(chunk);
      }
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_openai_stream",
      canonicalModelId: "openai/gpt-4o",
      providerModelId: "gpt-4o",
      messages: [{ role: "user", content: "Stream test" }],
      stream: true,
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "openai",
      providerRouteId: "gpt-4o",
      credentialId: "pcred_123",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "sk-test-stream-key",
    };
    (context as any).baseUrl = baseUrl;

    try {
      const events: any[] = [];
      for await (const evt of adapter.stream(request, context)) {
        events.push(evt);
      }

      const types = events.map((e) => e.type);
      expect(types).toContain("response.started");
      expect(types).toContain("output_text.delta");
      expect(types).toContain("output_text.done");
      expect(types).toContain("response.completed");

      const deltas = events.filter((e) => e.type === "output_text.delta").map((e) => e.delta).join("");
      expect(deltas).toBe("Hello world!");

      const completed = events.find((e) => e.type === "response.completed");
      expect(completed.response.output[0]?.content).toBe("Hello world!");
      expect(completed.usage.inputTokens).toBe(10);
      expect(completed.usage.outputTokens).toBe(5);
    } finally {
      server.close();
    }
  });

  it("handles tool calling in response correctly", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-tools-123",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_abc123",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: '{"location":"San Francisco, CA"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 15,
            total_tokens: 40,
          },
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_openai_tools",
      canonicalModelId: "openai/gpt-4o",
      providerModelId: "gpt-4o",
      messages: [{ role: "user", content: "What is the weather in SF?" }],
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get weather for location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      ],
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "openai",
      providerRouteId: "gpt-4o",
      credentialId: "pcred_123",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "sk-test-mock-key",
    };
    (context as any).baseUrl = baseUrl;

    try {
      const response = await adapter.execute(request, context);
      expect(response.finishReason).toBe("tool_call");
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.name).toBe("get_weather");
      expect(response.toolCalls?.[0]?.arguments).toBe('{"location":"San Francisco, CA"}');
    } finally {
      server.close();
    }
  });
});
