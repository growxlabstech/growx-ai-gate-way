import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Concurrency and Load Tests", () => {
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

  it("handles 30 concurrent requests across distinct tenants without state collisions or race conditions", async () => {
    // Generate 5 distinct API keys for 5 organizations
    const keys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { rawKey } = await fixture.createTestApiKey({
        organizationId: `org_concurrent_${i}`,
        workspaceId: `ws_concurrent_${i}`,
      });
      keys.push(rawKey);
    }

    const CONCURRENT_COUNT = 30;
    const startTime = Date.now();

    const promises = Array.from({ length: CONCURRENT_COUNT }).map(async (_, idx) => {
      const key = keys[idx % keys.length]!;
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: `Concurrent request ${idx}` }],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      const reqId = res.headers.get("x-growx-request-id")!;
      return { reqId, json };
    });

    const results = await Promise.all(promises);
    const totalTimeMs = Date.now() - startTime;

    expect(results).toHaveLength(CONCURRENT_COUNT);

    // Verify all request IDs are unique
    const uniqueReqIds = new Set(results.map((r) => r.reqId));
    expect(uniqueReqIds.size).toBe(CONCURRENT_COUNT);

    // Verify all 30 requests were persisted in repository with 'completed' status
    expect(fixture.gatewayRepo.requests.size).toBe(CONCURRENT_COUNT);
    for (const req of fixture.gatewayRepo.requests.values()) {
      expect(req.status).toBe("completed");
    }

    // Verify 30 calls were processed by adapter
    expect(fixture.mockAdapter.calls).toHaveLength(CONCURRENT_COUNT);

    // Verify average latency per request is low
    const avgTimePerReq = totalTimeMs / CONCURRENT_COUNT;
    expect(avgTimePerReq).toBeLessThan(300);
  });
});
