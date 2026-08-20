import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Model Restrictions & Policy Security Tests", () => {
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

  it("denies access when API key model rules explicitly deny requested canonical model", async () => {
    const { rawKey } = await fixture.createTestApiKey({
      modelRules: [{ effect: "deny", pattern: "openai/*" }],
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("model_not_allowed");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies access when API key model rules deny canonical model resolved from an alias", async () => {
    const { rawKey } = await fixture.createTestApiKey({
      modelRules: [{ effect: "deny", pattern: "openai/*" }],
    });

    // Request using alias 'growx/fast' which maps to 'openai/gpt-4o-mini'
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("model_not_allowed");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("returns 404 when requested model does not exist", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nonexistent/model-xyz",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("model_not_found");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });
});
