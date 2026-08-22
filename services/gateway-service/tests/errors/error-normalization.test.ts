import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { GrowXProviderError } from "@growx/contracts";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Error Normalization Tests", () => {
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

  it("normalizes provider 429 rate limit error to gateway 429 with request status 'failed'", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    fixture.mockAdapter.executeMock = async () => {
      throw new GrowXProviderError(
        "provider_rate_limit",
        "Provider rate limit exceeded: TPM limit reached",
        true,
        429,
      );
    };

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "test rate limit" }],
      }),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.type).toBe("rate_limit_error");
    expect(body.error.code).toBe("provider_rate_limit");

    const reqId = response.headers.get("x-growx-request-id")!;
    const req = await fixture.gatewayRepo.getRequest(reqId);
    expect(req?.status).toBe("failed");
    expect(req?.errorCode).toBe("provider_rate_limit");
  });

  it("returns 415 when Content-Type is not application/json", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "text/plain",
      },
      body: "plain text body",
    });

    expect(response.status).toBe(415);
    const body = await response.json();
    expect(body.error.code).toBe("unsupported_media_type");
  });

  it("returns 400 when body is malformed JSON", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: "{ not a valid json",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_json");
  });

  it("returns 413 when body exceeds maxBodyBytes limit", async () => {
    const { rawKey } = await fixture.createTestApiKey();

    // Create a payload larger than 5MB
    const bigString = "A".repeat(6 * 1024 * 1024);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: bigString }],
      }),
    });

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error.code).toBe("payload_too_large");
  });
});
