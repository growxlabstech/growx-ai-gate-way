/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "@growx/provider-sdk";
import type {
  NormalizedGenerationRequest,
  ProviderExecutionContext,
} from "@growx/contracts";
import http from "node:http";

describe("AnthropicAdapter Unit Tests", () => {
  const adapter = new AnthropicAdapter("anthropic");

  it("extracts cache tokens correctly", () => {
    const rawUsage = {
      input_tokens: 80,
      output_tokens: 30,
      cache_read_input_tokens: 50,
    };

    const usage = adapter.extractUsage(rawUsage);
    expect(usage.inputTokens).toBe(80);
    expect(usage.outputTokens).toBe(30);
    expect(usage.totalTokens).toBe(110);
    expect(usage.cachedInputTokens).toBe(50);
    expect(usage.source).toBe("provider_reported");
  });

  it("executes non-streaming request against mock Anthropic server and normalizes response", async () => {
    let capturedBody: any = null;
    let capturedApiKey: string | undefined = undefined;
    let capturedVersion: string | undefined = undefined;

    const server = http.createServer((req, res) => {
      capturedApiKey = req.headers["x-api-key"] as string;
      capturedVersion = req.headers["anthropic-version"] as string;
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        capturedBody = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_01AnthropicTest",
            content: [
              {
                type: "text",
                text: "Hello from Anthropic Claude!",
              },
            ],
            stop_reason: "end_turn",
            usage: {
              input_tokens: 15,
              output_tokens: 10,
            },
          })
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_anthropic_1",
      canonicalModelId: "anthropic/claude-3-5-sonnet",
      providerModelId: "claude-3-5-sonnet-20241022",
      systemPrompt: "You are Claude, created by Anthropic.",
      messages: [{ role: "user", content: "Hi Claude" }],
      temperature: 0.5,
      maxOutputTokens: 250,
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "anthropic",
      providerRouteId: "claude-3-5-sonnet-20241022",
      credentialId: "pcred_anthropic_1",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "mock-ant-test-mock-key-123",
    };
    (context as any).baseUrl = baseUrl;

    try {
      const response = await adapter.execute(request, context);

      expect(response.requestId).toBe(request.requestId);
      expect(response.providerId).toBe("anthropic");
      expect(response.providerModelId).toBe("claude-3-5-sonnet-20241022");
      expect(response.output[0]?.content).toBe("Hello from Anthropic Claude!");
      expect(response.finishReason).toBe("stop");
      expect(response.usage.inputTokens).toBe(15);
      expect(response.usage.outputTokens).toBe(10);
      expect(response.providerRequestId).toBe("msg_01AnthropicTest");

      expect(capturedApiKey).toBe("mock-ant-test-mock-key-123");
      expect(capturedVersion).toBe("2023-06-01");
      expect(capturedBody.system).toBe("You are Claude, created by Anthropic.");
      expect(capturedBody.max_tokens).toBe(250);
    } finally {
      server.close();
    }
  });

  it("handles streaming request with Anthropic SSE format", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });

      const ssePayload = [
        `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":20}}}\n\n`,
        `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Cla"}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ude!"}}\n\n`,
        `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
        `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ];

      for (const line of ssePayload) {
        res.write(line);
      }
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_anthropic_stream",
      canonicalModelId: "anthropic/claude-3-5-sonnet",
      providerModelId: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Who are you?" }],
      stream: true,
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "anthropic",
      providerRouteId: "claude-3-5-sonnet-20241022",
      credentialId: "pcred_1",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "mock-ant-test-key",
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
      expect(deltas).toBe("Claude!");

      const completed = events.find((e) => e.type === "response.completed");
      expect(completed.response.output[0]?.content).toBe("Claude!");
      expect(completed.usage.inputTokens).toBe(20);
      expect(completed.usage.outputTokens).toBe(7);
      expect(completed.finishReason).toBe("stop");
    } finally {
      server.close();
    }
  });

  it("handles tool calling in Anthropic format", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_tool_call_1",
          content: [
            {
              type: "tool_use",
              id: "toolu_01A09q90tc1q09",
              name: "search_database",
              input: { query: "GrowX AI architecture" },
            },
          ],
          stop_reason: "tool_use",
          usage: {
            input_tokens: 30,
            output_tokens: 20,
          },
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const request: NormalizedGenerationRequest = {
      requestId: "req_test_anthropic_tools",
      canonicalModelId: "anthropic/claude-3-5-sonnet",
      providerModelId: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Search for GrowX architecture" }],
      tools: [
        {
          type: "function",
          name: "search_database",
          description: "Search system database",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
    };

    const context: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: "anthropic",
      providerRouteId: "claude-3-5-sonnet-20241022",
      credentialId: "pcred_1",
      canonicalModelId: request.canonicalModelId,
      providerModelId: request.providerModelId,
      timeoutMs: 5000,
      decryptedCredential: "mock-ant-key",
    };
    (context as any).baseUrl = baseUrl;

    try {
      const response = await adapter.execute(request, context);
      expect(response.finishReason).toBe("tool_call");
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.id).toBe("toolu_01A09q90tc1q09");
      expect(response.toolCalls?.[0]?.name).toBe("search_database");
      expect(response.toolCalls?.[0]?.arguments).toBe('{"query":"GrowX AI architecture"}');
    } finally {
      server.close();
    }
  });
});
