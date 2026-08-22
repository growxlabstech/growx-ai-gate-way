import { describe, expect, it, beforeEach } from "vitest";
import {
  evaluateCacheEligibility,
  DEFAULT_CACHE_POLICY_CONFIG,
  InMemoryExactCacheStore,
  CacheService,
} from "../src/index.js";
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";

describe("Cache Eligibility & Store Operations", () => {
  it("enforces deterministic-only default rules", () => {
    const deterministicReq: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "2 + 2?" }],
      temperature: 0,
    };

    const nonDeterministicReq: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Write a poem" }],
      temperature: 0.7,
    };

    expect(
      evaluateCacheEligibility(deterministicReq, DEFAULT_CACHE_POLICY_CONFIG)
        .eligible,
    ).toBe(true);
    expect(
      evaluateCacheEligibility(nonDeterministicReq, DEFAULT_CACHE_POLICY_CONFIG)
        .eligible,
    ).toBe(false);
    expect(
      evaluateCacheEligibility(nonDeterministicReq, DEFAULT_CACHE_POLICY_CONFIG)
        .reason,
    ).toBe("NON_DETERMINISTIC");
  });

  it("bypasses requests declaring unsafe tools by default", () => {
    const toolReq: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Execute command" }],
      tools: [{ type: "function", function: { name: "bash" } }],
      temperature: 0,
    };

    const decision = evaluateCacheEligibility(
      toolReq,
      DEFAULT_CACHE_POLICY_CONFIG,
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("TOOLS_UNSAFE");
  });

  it("stores and retrieves cache entries with TTL expiration", async () => {
    const store = new InMemoryExactCacheStore();
    const service = new CacheService({ store });

    const req: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "What is capital of France?" }],
      temperature: 0,
    };

    const res: OpenAIChatCompletionResponse = {
      id: "chatcmpl_test_1",
      object: "chat.completion",
      created: 1720000000,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Paris" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    };

    // 1. Initial lookup -> MISS
    const lookup1 = await service.lookup({
      organizationId: "org_test",
      workspaceId: "ws_test",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "fp_1",
      request: req,
    });
    expect(lookup1.status).toBe("MISS");

    // 2. Admit and store
    const stored = await service.admitAndStore({
      organizationId: "org_test",
      workspaceId: "ws_test",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "fp_1",
      request: req,
      response: res,
      sourceRequestId: "req_source_1",
      ttlSeconds: 3600,
    });
    expect(stored).toBe(true);

    // 3. Second lookup -> HIT
    const lookup2 = await service.lookup({
      organizationId: "org_test",
      workspaceId: "ws_test",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "fp_1",
      request: req,
    });
    expect(lookup2.status).toBe("HIT");
    expect(lookup2.entry?.responsePayload.choices[0]?.message.content).toBe(
      "Paris",
    );
    expect(lookup2.entry?.responseMetadata.logicalUsage.totalTokens).toBe(12);
  });

  it("supports workspace-scoped invalidation", async () => {
    const store = new InMemoryExactCacheStore();
    const service = new CacheService({ store });

    const req: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Test invalidation" }],
      temperature: 0,
    };

    const res: OpenAIChatCompletionResponse = {
      id: "chatcmpl_test_inv",
      object: "chat.completion",
      created: 1720000000,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Result" },
          finish_reason: "stop",
        },
      ],
    };

    await service.admitAndStore({
      organizationId: "org_test",
      workspaceId: "ws_test",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "fp_1",
      request: req,
      response: res,
      sourceRequestId: "req_1",
    });

    const count = await service.invalidate({
      organizationId: "org_test",
      workspaceId: "ws_test",
    });
    expect(count).toBe(1);

    const lookupAfter = await service.lookup({
      organizationId: "org_test",
      workspaceId: "ws_test",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "fp_1",
      request: req,
    });
    expect(lookupAfter.status).toBe("MISS");
  });
});
