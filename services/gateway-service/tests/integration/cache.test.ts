import { describe, expect, it, beforeEach } from "vitest";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";

describe("Phase 15: Exact Prompt / Response Cache Integration", () => {
  let fixture: TestGatewayFixture;

  async function getAuth(overrides?: any): Promise<MachineAuthContext> {
    const keyData = await fixture.createTestApiKey(overrides);
    const authRes = await fixture.apiKeyService.authenticate({
      authorization: `Bearer ${keyData.rawKey}`,
      clientIp: "127.0.0.1",
    });
    if (!authRes.allowed) {
      throw new Error(`Failed to authenticate test key: ${authRes.code}`);
    }
    return (authRes as any).context;
  }

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
  });

  it("serves cache HIT on identical deterministic request avoiding provider execution", async () => {
    const auth = await getAuth();
    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [
        { role: "user", content: "What is the boiling point of water?" },
      ],
      temperature: 0,
      stream: false,
    };

    // First request: Cold cache -> Provider execution
    const res1 = await fixture.gatewayEngine.executeChatCompletion(auth, req);
    expect(res1.choices[0]?.message.content).toContain(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // Second request: Cache HIT -> 0 additional provider calls
    const res2 = await fixture.gatewayEngine.executeChatCompletion(auth, req);
    expect(res2.choices[0]?.message.content).toContain(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls).toHaveLength(1); // Provider NOT called again!

    // Verify usage ledger recorded 0 provider attempts for the cache hit
    const savedRequests = Array.from(fixture.gatewayRepo.requests.values());
    expect(savedRequests).toHaveLength(2);
    expect((savedRequests[1] as any)?.cachedResponseUsed).toBe(true);
    expect(savedRequests[1]?.providerId).toBe("cache");
  });

  it("yields cache MISS when input or temperature differs", async () => {
    const auth = await getAuth();

    const req1: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Question A" }],
      temperature: 0,
      stream: false,
    };

    const req2: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Question B" }],
      temperature: 0,
      stream: false,
    };

    await fixture.gatewayEngine.executeChatCompletion(auth, req1);
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    await fixture.gatewayEngine.executeChatCompletion(auth, req2);
    expect(fixture.mockAdapter.calls).toHaveLength(2);
  });

  it("enforces strict tenant isolation across workspaces", async () => {
    const authA = await getAuth({
      organizationId: "org_alpha",
      workspaceId: "ws_alpha",
    });
    const authB = await getAuth({
      organizationId: "org_beta",
      workspaceId: "ws_beta",
    });

    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Universal secret calculation" }],
      temperature: 0,
      stream: false,
    };

    // Workspace A executes -> Provider call 1
    await fixture.gatewayEngine.executeChatCompletion(authA, req);
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // Workspace B executes same prompt -> Must NOT hit Workspace A cache! -> Provider call 2
    await fixture.gatewayEngine.executeChatCompletion(authB, req);
    expect(fixture.mockAdapter.calls).toHaveLength(2);
  });

  it("enforces policy before cache lookup (denies cached response if policy denies model)", async () => {
    const auth = await getAuth();
    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Policy sensitive prompt" }],
      temperature: 0,
      stream: false,
    };

    // 1. Initial request populates cache
    await fixture.gatewayEngine.executeChatCompletion(auth, req);
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // 2. Introduce a blocking policy that denies the canonical model
    await fixture.gatewayEngine.policyEngine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: auth.workspaceId,
        name: "Block Fast Model",
        createdBy: "usr_operator",
        definition: {
          rules: [
            {
              id: "r1",
              target: "model",
              effect: "deny",
              operator: "equals",
              value: "openai/gpt-4o-mini",
            },
          ],
        },
      },
      "usr_operator",
    );

    // 3. Request must fail with 403 policy denial, not replay stale cache
    await expect(
      fixture.gatewayEngine.executeChatCompletion(auth, req),
    ).rejects.toThrow();
  });

  it("replays cached responses as SSE chunks for streaming requests", async () => {
    const auth = await getAuth();
    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Stream me please" }],
      temperature: 0,
      stream: true,
    };

    // First: populate cache via non-streaming
    await fixture.gatewayEngine.executeChatCompletion(auth, {
      ...req,
      stream: false,
    });
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // Streaming request: hits cache, replays chunks without calling provider stream
    const chunks: any[] = [];
    for await (const chunk of fixture.gatewayEngine.streamChatCompletion(
      auth,
      req,
    )) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(
      chunks.some((c) => {
        const deltaContent = c.choices?.[0]?.delta?.content;
        return (
          typeof deltaContent === "string" &&
          deltaContent.includes("mock provider")
        );
      }),
    ).toBe(true);
    expect(fixture.mockAdapter.streamCalls).toHaveLength(0); // Provider stream was never called!
  });

  it("protects against cache stampedes with single-flight request coalescing", async () => {
    const auth = await getAuth();
    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Stampede test prompt" }],
      temperature: 0,
      stream: false,
    };

    // 30 concurrent identical requests on a cold cache
    const promises = Array.from({ length: 30 }, () =>
      fixture.gatewayEngine.executeChatCompletion(auth, req),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(30);
    expect(
      results.every((r) => {
        const content = r.choices[0]?.message.content;
        return typeof content === "string" && content.includes("mock provider");
      }),
    ).toBe(true);

    // Only 1 provider execution happened despite 30 concurrent callers
    expect(fixture.mockAdapter.calls).toHaveLength(1);
  });

  it("supports tenant-scoped cache invalidation", async () => {
    const auth = await getAuth();
    const req: OpenAIChatCompletionRequest = {
      model: "growx/fast",
      messages: [{ role: "user", content: "Invalidate me later" }],
      temperature: 0,
      stream: false,
    };

    await fixture.gatewayEngine.executeChatCompletion(auth, req);
    expect(fixture.mockAdapter.calls).toHaveLength(1);

    // Invalidate workspace cache
    const invalidatedCount =
      await fixture.gatewayEngine.cacheService.invalidate({
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
      });
    await fixture.gatewayEngine.semanticCacheService.invalidate({
      organizationId: auth.organizationId,
      workspaceId: auth.workspaceId,
    });
    expect(invalidatedCount).toBe(1);

    // Next request misses cache and re-executes provider
    await fixture.gatewayEngine.executeChatCompletion(auth, req);
    expect(fixture.mockAdapter.calls).toHaveLength(2);
  });
});
