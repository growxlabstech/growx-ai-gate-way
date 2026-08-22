import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Chat Completions End-to-End Integration Tests", () => {
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

  it("executes a complete end-to-end chat completion request successfully", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello GrowX!" },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-growx-request-id")).toMatch(/^req_/);

    const body = await response.json();
    expect(body.id).toMatch(/^chatcmpl_/);
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.choices[0].message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage.prompt_tokens).toBe(12);
    expect(body.usage.completion_tokens).toBe(8);
    expect(body.usage.total_tokens).toBe(20);

    // Verify exactly 1 call to mock provider
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // Verify request lifecycle persisted in repository
    const reqId = response.headers.get("x-growx-request-id")!;
    const persistedRequest = await fixture.gatewayRepo.getRequest(reqId);
    expect(persistedRequest).toBeDefined();
    expect(persistedRequest?.status).toBe("completed");
    expect(persistedRequest?.requestedModel).toBe("openai/gpt-4o-mini");
    expect(persistedRequest?.resolvedModel).toBe("openai/gpt-4o-mini");
    expect(persistedRequest?.latencyMs).toBeGreaterThan(0);

    // Verify usage snapshot persisted
    const usage = Array.from(fixture.gatewayRepo.usages.values()).find(
      (u) => u.requestId === reqId,
    );
    expect(usage).toBeDefined();
    expect(usage?.totalTokens).toBe(20);
    expect(usage?.cachedInputTokens).toBe(2);

    // Verify async events emitted
    expect(fixture.gatewayEvents.startedEvents).toHaveLength(1);
    expect(fixture.gatewayEvents.completedEvents).toHaveLength(1);
    expect(fixture.gatewayEvents.completedEvents[0]?.requestId).toBe(reqId);
  });

  it("lists models for authenticated machine clients via GET /v1/models", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${rawKey}`,
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.object).toBe("list");
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.some((m: any) => m.id === "openai/gpt-4o-mini")).toBe(
      true,
    );
  });
});
