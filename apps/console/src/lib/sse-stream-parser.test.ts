import { describe, expect, it } from "vitest";
import { parseSseStream } from "./sse-stream-parser";

describe("SSE Stream Parser", () => {
  function createMockResponse(
    chunks: string[],
    headers: Record<string, string> = {},
  ): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "req_test123",
        ...headers,
      },
    });
  }

  it("parses text delta chunks and triggers onDelta and onDone", async () => {
    const sseChunks = [
      'data: {"id":"req_1","choices":[{"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
      'data: {"id":"req_1","choices":[{"delta":{"content":" world!"}}]}\n\n',
      'data: {"id":"req_1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":0.00005}}\n\n',
      "data: [DONE]\n\n",
    ];

    const deltas: string[] = [];
    let startReqId: string | null = null;
    let completedText = "";
    let capturedUsage: any = null;

    await parseSseStream(createMockResponse(sseChunks), {
      onStart: (id) => {
        startReqId = id;
      },
      onDelta: (chunk) => {
        deltas.push(chunk);
      },
      onToolCallDelta: () => {},
      onUsage: (u) => {
        capturedUsage = u;
      },
      onEvent: () => {},
      onError: () => {},
      onDone: (text) => {
        completedText = text;
      },
    });

    expect(startReqId).toBe("req_test123");
    expect(deltas).toEqual(["Hello", " world!"]);
    expect(completedText).toBe("Hello world!");
    expect(capturedUsage).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
      cost: 0.00005,
    });
  });

  it("assembles fragmented tool call deltas correctly", async () => {
    const chunk1 = {
      choices: [
        {
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "call_123",
                type: "function",
                function: { name: "search", arguments: '{"q' },
              },
            ],
          },
        },
      ],
    };

    const chunk2 = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: 'uery":"ai"}' },
              },
            ],
          },
        },
      ],
    };

    const sseChunks = [
      `data: ${JSON.stringify(chunk1)}\n\n`,
      `data: ${JSON.stringify(chunk2)}\n\n`,
      "data: [DONE]\n\n",
    ];

    let lastToolCalls: any[] = [];

    await parseSseStream(createMockResponse(sseChunks), {
      onStart: () => {},
      onDelta: () => {},
      onToolCallDelta: (tcs) => {
        lastToolCalls = tcs;
      },
      onUsage: () => {},
      onEvent: () => {},
      onError: () => {},
      onDone: () => {},
    });

    expect(lastToolCalls.length).toBe(1);
    expect(lastToolCalls[0].id).toBe("call_123");
    expect(lastToolCalls[0].function.name).toBe("search");
    expect(lastToolCalls[0].function.arguments).toBe('{"query":"ai"}');
  });

  it("handles stream-level error frames", async () => {
    const sseChunks = [
      'data: {"error":{"message":"Rate limit exceeded","code":"rate_limit_exceeded","type":"rate_limit_error"}}\n\n',
    ];

    let errorReceived: any = null;

    await parseSseStream(createMockResponse(sseChunks), {
      onStart: () => {},
      onDelta: () => {},
      onToolCallDelta: () => {},
      onUsage: () => {},
      onEvent: () => {},
      onError: (err) => {
        errorReceived = err;
      },
      onDone: () => {},
    });

    expect(errorReceived).toEqual({
      message: "Rate limit exceeded",
      code: "rate_limit_exceeded",
      type: "rate_limit_error",
    });
  });
});
