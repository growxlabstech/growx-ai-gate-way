import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Tool Calling End-to-End Tests", () => {
  let fixture: TestGatewayFixture;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    server = fixture.server;
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as { port: number };
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("handles OpenAI-compatible tool call definition and returns tool_calls in response", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    // Configure mock adapter to return a tool call
    fixture.mockAdapter.executeMock = async (req, ctx) => ({
      requestId: req.requestId,
      canonicalModelId: req.canonicalModelId,
      providerId: ctx.providerId,
      providerModelId: req.providerModelId,
      output: [{ role: "assistant", content: "" }],
      finishReason: "tool_call",
      toolCalls: [
        {
          id: "call_abc123",
          name: "get_current_weather",
          arguments: JSON.stringify({
            location: "San Francisco, CA",
            unit: "celsius",
          }),
        },
      ],
      usage: {
        inputTokens: 25,
        outputTokens: 15,
        totalTokens: 40,
        source: "provider_reported",
      },
      timing: {
        startedAt: new Date(),
        completedAt: new Date(),
        latencyMs: 30,
      },
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "What is the weather in SF?" }],
        tools: [
          {
            type: "function",
            name: "get_current_weather",
            description: "Get the current weather for a given location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City and state" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        ],
        tool_choice: "auto",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.choices[0].message.tool_calls).toHaveLength(1);
    expect(body.choices[0].message.tool_calls[0].id).toBe("call_abc123");
    expect(body.choices[0].message.tool_calls[0].type).toBe("function");
    expect(body.choices[0].message.tool_calls[0].function.name).toBe(
      "get_current_weather",
    );
    expect(
      JSON.parse(body.choices[0].message.tool_calls[0].function.arguments)
        .location,
    ).toBe("San Francisco, CA");
  });
});
