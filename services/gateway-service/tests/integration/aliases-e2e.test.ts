import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Model Alias Resolution End-to-End Tests", () => {
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

  it("resolves model alias 'growx/fast' to 'openai/gpt-4o-mini' and preserves requested model in response and request record", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Fast test" }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model).toBe("growx/fast");

    // Verify mock adapter received canonicalModelId
    expect(fixture.mockAdapter.calls[0]?.canonicalModelId).toBe("openai/gpt-4o-mini");

    // Verify request lifecycle persisted both requestedModel and resolvedModel
    const reqId = response.headers.get("x-growx-request-id")!;
    const req = await fixture.gatewayRepo.getRequest(reqId);
    expect(req?.requestedModel).toBe("growx/fast");
    expect(req?.resolvedModel).toBe("openai/gpt-4o-mini");
  });
});
