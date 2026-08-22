import { describe, expect, it, beforeEach } from "vitest";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";

describe("Phase 24 — Semantic Cache Gateway Integration", () => {
  let fixture: TestGatewayFixture;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
  });

  it("1. Returns semantic cache hit on rephrased prompt with 0 provider calls and new request ID", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_semantic_1",
      workspaceId: "ws_semantic_1",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // 1. Initial Request (Cold Miss -> Provider Executed -> Admitted to Semantic Cache)
    const initialReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a cloud computing expert." },
        { role: "user", content: "Explain Kubernetes simply" },
      ],
      temperature: 0,
      stream: false,
    };

    const res1 = await fixture.gatewayEngine.executeChatCompletion(
      auth as any,
      initialReq as any,
    );
    expect(res1.choices[0]?.message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls.length).toBe(1);

    // 2. Semantically Rephrased Request (Semantic Cache Hit -> 0 Provider Calls)
    const rephrasedReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a cloud computing expert." },
        { role: "user", content: "Explain Kubernetes simply." },
      ],
      temperature: 0,
      stream: false,
    };

    const res2 = await fixture.gatewayEngine.executeChatCompletion(
      auth as any,
      rephrasedReq as any,
    );
    expect(res2.choices[0]?.message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls.length).toBe(1); // Provider NOT called again!
    expect(res2.id).not.toBe(res1.id); // New unique request ID generated
  });

  it("2. Replays cached response as streaming chunks on semantic cache hit", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_semantic_stream",
      workspaceId: "ws_semantic_stream",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    const req1: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "What is Docker?" }],
      temperature: 0,
      stream: true,
    };

    // 1. Initial streaming request
    const chunks1: any[] = [];
    for await (const chunk of fixture.gatewayEngine.streamChatCompletion(
      auth as any,
      req1 as any,
    )) {
      chunks1.push(chunk);
    }
    expect(chunks1.length).toBeGreaterThan(0);
    expect(fixture.mockAdapter.streamCalls.length).toBe(1);

    // 2. Semantic rephrased streaming request -> hits semantic cache -> 0 provider stream calls
    const req2: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "What is Docker." }],
      temperature: 0,
      stream: true,
    };

    const chunks2: any[] = [];
    for await (const chunk of fixture.gatewayEngine.streamChatCompletion(
      auth as any,
      req2 as any,
    )) {
      chunks2.push(chunk);
    }
    expect(chunks2.length).toBeGreaterThan(0);
    expect(fixture.mockAdapter.streamCalls.length).toBe(1); // Provider was not called again!
  });

  it("3. Enforces tenant isolation between different organizations", async () => {
    const { record: keyOrgA } = await fixture.createTestApiKey({
      organizationId: "org_sec_A",
      workspaceId: "ws_sec_A",
    });
    const { record: keyOrgB } = await fixture.createTestApiKey({
      organizationId: "org_sec_B",
      workspaceId: "ws_sec_B",
    });

    const authA = {
      apiKeyId: keyOrgA.id,
      organizationId: keyOrgA.organizationId,
      workspaceId: keyOrgA.workspaceId,
      environmentId: keyOrgA.environmentId,
      environment: keyOrgA.environment,
      role: keyOrgA.role,
      permissions: keyOrgA.permissions,
      rateLimits: keyOrgA.rateLimits,
      modelRules: keyOrgA.modelRules,
      ipAllowlist: keyOrgA.ipAllowlist,
      status: keyOrgA.status,
    };

    const authB = {
      apiKeyId: keyOrgB.id,
      organizationId: keyOrgB.organizationId,
      workspaceId: keyOrgB.workspaceId,
      environmentId: keyOrgB.environmentId,
      environment: keyOrgB.environment,
      role: keyOrgB.role,
      permissions: keyOrgB.permissions,
      rateLimits: keyOrgB.rateLimits,
      modelRules: keyOrgB.modelRules,
      ipAllowlist: keyOrgB.ipAllowlist,
      status: keyOrgB.status,
    };

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Tell me secret facts" }],
      temperature: 0,
      stream: false,
    };

    // Org A populates semantic cache
    await fixture.gatewayEngine.executeChatCompletion(authA as any, req as any);
    expect(fixture.mockAdapter.calls.length).toBe(1);

    // Org B makes identical request -> MUST NOT hit Org A's cache -> Provider is executed
    await fixture.gatewayEngine.executeChatCompletion(authB as any, req as any);
    expect(fixture.mockAdapter.calls.length).toBe(2);
  });

  it("4. Honors global kill switch by bypassing semantic cache immediately", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_kill_switch",
      workspaceId: "ws_kill_switch",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Test kill switch" }],
      temperature: 0,
      stream: false,
    };

    await fixture.gatewayEngine.executeChatCompletion(auth as any, req as any);
    expect(fixture.mockAdapter.calls.length).toBe(1);

    // Turn ON semantic cache kill switch
    fixture.gatewayEngine.semanticCacheService.setKillSwitch(true);

    // Rephrased prompt lookup -> semantic cache bypassed -> Provider executed
    const rephrased: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Test kill switch." }],
      temperature: 0,
      stream: false,
    };

    await fixture.gatewayEngine.executeChatCompletion(
      auth as any,
      rephrased as any,
    );
    expect(fixture.mockAdapter.calls.length).toBe(2);
  });
});
