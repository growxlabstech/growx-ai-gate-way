import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type {
  NormalizedStreamEvent,
  NormalizedGenerationRequest,
  ProviderExecutionContext,
} from "@growx/contracts";
import { GrowXProviderError } from "@growx/contracts";

let fixture: TestGatewayFixture;
let baseUrl: string;

beforeEach(async () => {
  fixture = await createTestGatewayFixture();
  await new Promise<void>((resolve) => fixture.server.listen(0, resolve));
  const addr = fixture.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
});

describe("Streaming Lifecycle Tests", () => {
  it("completes a happy-path stream with DB records", async () => {
    const { key } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");

    const body = await response.text();
    expect(body).toContain("data: ");
    expect(body).toContain("data: [DONE]");

    // Parse chunks
    const chunks = body
      .split("\n\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
      .map((l) => JSON.parse(l.replace("data: ", "")));

    expect(chunks.length).toBeGreaterThanOrEqual(2); // at least started + delta

    // Verify first chunk has role
    expect(chunks[0].choices[0].delta.role).toBe("assistant");

    // Verify DB request record
    const reqRecord = await fixture.gatewayRepo.getRequest(
      response.headers.get("x-growx-request-id")!,
    );
    expect(reqRecord).toBeDefined();
    expect(reqRecord!.status).toBe("completed");
    expect(reqRecord!.stream).toBe(true);
    expect(reqRecord!.completedAt).not.toBeNull();
    expect(reqRecord!.latencyMs).not.toBeNull();

    // Verify latency record was persisted
    const latency = fixture.gatewayRepo.latencies.get(reqRecord!.id);
    expect(latency).toBeDefined();
    expect(latency!.totalLatencyMs).toBeGreaterThanOrEqual(0);

    // Verify usage was persisted
    expect(fixture.gatewayRepo.usages.size).toBeGreaterThanOrEqual(1);

    // Verify completed event was emitted
    expect(fixture.gatewayEvents.completedEvents.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("handles provider error mid-stream with safe SSE error frame", async () => {
    // Configure mock adapter to fail mid-stream
    fixture.mockAdapter.streamMock = async function* (
      req: NormalizedGenerationRequest,
      ctx: ProviderExecutionContext,
    ): AsyncIterable<NormalizedStreamEvent> {
      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 0,
        type: "response.started",
        timestamp: new Date().toISOString(),
      };

      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 1,
        type: "output_text.delta",
        delta: "Partial output before ",
        timestamp: new Date().toISOString(),
      };

      // Simulate provider error
      throw new GrowXProviderError(
        "provider_server_error",
        "Provider internal failure",
        true,
        503,
      );
    };

    const { key } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Fail mid-stream" }],
        stream: true,
      }),
    });

    // Stream still starts successfully (200 status was sent before error)
    expect(response.status).toBe(200);

    const body = await response.text();

    // Should have the initial data chunks
    expect(body).toContain("data: ");

    // Should end with DONE (the error handler writes error + done)
    expect(body).toContain("[DONE]");

    // Verify request marked as failed
    const reqId = response.headers.get("x-growx-request-id")!;
    const reqRecord = await fixture.gatewayRepo.getRequest(reqId);
    expect(reqRecord).toBeDefined();
    expect(reqRecord!.status).toBe("failed");

    // Verify error record was persisted
    expect(fixture.gatewayRepo.errors.size).toBeGreaterThanOrEqual(1);

    // Verify failed event was emitted
    expect(fixture.gatewayEvents.failedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("supports stream_options.include_usage in final chunk", async () => {
    const { key } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Count to 5" }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    expect(response.status).toBe(200);

    const body = await response.text();
    const chunks = body
      .split("\n\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
      .map((l) => JSON.parse(l.replace("data: ", "")));

    // The last data chunk (response.completed) should have usage
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.usage).toBeDefined();
    expect(lastChunk.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
    expect(lastChunk.usage.completion_tokens).toBeGreaterThanOrEqual(0);
    expect(lastChunk.usage.total_tokens).toBeGreaterThanOrEqual(0);
  });

  it("handles tool call streaming with correct delta structure", async () => {
    fixture.mockAdapter.streamMock = async function* (
      req: NormalizedGenerationRequest,
      ctx: ProviderExecutionContext,
    ): AsyncIterable<NormalizedStreamEvent> {
      const now = new Date().toISOString();
      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 0,
        type: "response.started",
        timestamp: now,
      };

      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 1,
        type: "tool_call.started",
        timestamp: now,
        toolCall: {
          id: "call_abc123",
          name: "get_weather",
          index: 0,
        },
      };

      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 2,
        type: "tool_call.delta",
        timestamp: now,
        toolCall: {
          index: 0,
          argumentsDelta: '{"city":',
        },
      };

      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 3,
        type: "tool_call.delta",
        timestamp: now,
        toolCall: {
          index: 0,
          argumentsDelta: '"London"}',
        },
      };

      yield {
        requestId: req.requestId,
        responseId: `resp_${req.requestId}`,
        sequence: 4,
        type: "response.completed",
        finishReason: "tool_call",
        timestamp: now,
        response: {
          requestId: req.requestId,
          canonicalModelId: req.canonicalModelId,
          providerId: ctx.providerId,
          providerModelId: req.providerModelId,
          output: [{ role: "assistant", content: "" }],
          finishReason: "tool_call",
          toolCalls: [
            {
              id: "call_abc123",
              name: "get_weather",
              arguments: '{"city":"London"}',
            },
          ],
          usage: {
            inputTokens: 20,
            outputTokens: 12,
            totalTokens: 32,
            source: "provider_reported",
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            latencyMs: 30,
          },
        },
      };
    };

    const { key } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "What's the weather?" }],
        stream: true,
        tools: [
          {
            type: "function",
            name: "get_weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const body = await response.text();
    const chunks = body
      .split("\n\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
      .map((l) => JSON.parse(l.replace("data: ", "")));

    // Find tool call chunks
    const toolCallChunks = chunks.filter(
      (c: any) => c.choices[0]?.delta?.tool_calls,
    );
    expect(toolCallChunks.length).toBeGreaterThanOrEqual(2);

    // First tool call chunk should have id and name
    const firstToolChunk = toolCallChunks[0];
    expect(firstToolChunk.choices[0].delta.tool_calls[0].id).toBe(
      "call_abc123",
    );
    expect(firstToolChunk.choices[0].delta.tool_calls[0].function.name).toBe(
      "get_weather",
    );

    // Last chunk should have finish_reason = tool_calls
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.choices[0].finish_reason).toBe("tool_calls");
  });
});
