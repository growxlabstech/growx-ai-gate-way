import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Streaming Chat Completions Integration Tests", () => {
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

  it("streams chat completion chunks as Server-Sent Events (SSE)", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Tell me a joke" }],
        stream: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await response.text();
    expect(text).toContain("data: [DONE]");
    expect(text).toContain("data: {");

    // Parse SSE lines
    const lines = text
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");

    expect(lines.length).toBeGreaterThan(0);
    const parsedChunks = lines.map((l) => JSON.parse(l.slice(6)));

    expect(parsedChunks[0].object).toBe("chat.completion.chunk");
    expect(
      parsedChunks.some(
        (c) => c.choices[0]?.delta?.content === "Hello from stream!",
      ),
    ).toBe(true);

    // Verify stream call happened
    expect(fixture.mockAdapter.streamCalls).toHaveLength(1);

    // Verify request lifecycle finalized
    const reqId = response.headers.get("x-growx-request-id")!;
    const req = await fixture.gatewayRepo.getRequest(reqId);
    expect(req?.status).toBe("completed");
    expect(req?.stream).toBe(true);
  });
});
