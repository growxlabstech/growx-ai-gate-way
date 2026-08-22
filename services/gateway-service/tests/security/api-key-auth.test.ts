import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("API Key Authentication Security Tests", () => {
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

  it("denies request without Authorization header (401) with 0 provider calls", async () => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("missing_api_key");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies request with query param api_key (400) with 0 provider calls", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(
      `${baseUrl}/v1/chat/completions?api_key=${rawKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
        }),
      },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_api_key");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies request with expired API key (401) with 0 provider calls", async () => {
    const { rawKey } = await fixture.createTestApiKey({
      status: "expired",
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("expired_api_key");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies request with revoked API key (401) with 0 provider calls", async () => {
    const { rawKey } = await fixture.createTestApiKey({
      status: "revoked",
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("revoked_api_key");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies request when API key lacks chat.completions.create capability (403) with 0 provider calls", async () => {
    const { rawKey } = await fixture.createTestApiKey({
      permissions: ["models.read"], // Only models.read, lacks chat.completions.create
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("permission_denied");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("denies request when organization is suspended (403) with 0 provider calls", async () => {
    const { rawKey, record } = await fixture.createTestApiKey();
    fixture.apiKeyRepo.setTenantState(record.organizationId, {
      organizationStatus: "suspended",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("organization_suspended");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });
});
