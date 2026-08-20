import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Structured Output End-to-End Tests", () => {
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

  it("handles structured output JSON schema and forwards JSON result in choices[0].message.content", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const expectedJson = { name: "Alice", age: 30, email: "alice@example.com" };

    fixture.mockAdapter.executeMock = async (req, ctx) => {
      expect(req.structuredOutput).toBeDefined();
      expect(req.structuredOutput?.type).toBe("json_schema");
      expect(req.structuredOutput?.name).toBe("PersonInfo");

      return {
        requestId: req.requestId,
        canonicalModelId: req.canonicalModelId,
        providerId: ctx.providerId,
        providerModelId: req.providerModelId,
        output: [{ role: "assistant", content: JSON.stringify(expectedJson) }],
        finishReason: "stop",
        usage: {
          inputTokens: 20,
          outputTokens: 12,
          totalTokens: 32,
          source: "provider_reported",
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          latencyMs: 25,
        },
      };
    };

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Extract info: Alice is 30, alice@example.com" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "PersonInfo",
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "integer" },
                email: { type: "string" },
              },
              required: ["name", "age", "email"],
            },
            strict: true,
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.choices[0].message.content).toBe(JSON.stringify(expectedJson));
    expect(JSON.parse(body.choices[0].message.content)).toEqual(expectedJson);
  });
});
