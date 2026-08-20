import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Tenant Isolation Security Tests", () => {
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

  it("strictly binds request execution and persistence to API key tenant without trusting client spoofing headers", async () => {
    const orgA = "org_alpha_123";
    const wsA = "ws_alpha_456";
    const envA = "env_alpha_789";

    const { rawKey } = await fixture.createTestApiKey({
      organizationId: orgA,
      workspaceId: wsA,
      environmentId: envA,
    });

    // Client attempts to spoof Org B and Workspace B in headers
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${rawKey}`,
        "Content-Type": "application/json",
        "x-organization-id": "org_bravo_spoofed",
        "x-workspace-id": "ws_bravo_spoofed",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(response.status).toBe(200);
    const reqId = response.headers.get("x-growx-request-id")!;

    // Verify persisted request record belongs exclusively to Org A and Workspace A
    const req = await fixture.gatewayRepo.getRequest(reqId);
    expect(req?.organizationId).toBe(orgA);
    expect(req?.workspaceId).toBe(wsA);
    expect(req?.environmentId).toBe(envA);

    // Verify emitted event belongs strictly to Org A
    const startedEvent = fixture.gatewayEvents.startedEvents.find((e) => e.requestId === reqId);
    expect(startedEvent?.organizationId).toBe(orgA);
    expect(startedEvent?.workspaceId).toBe(wsA);
  });
});
