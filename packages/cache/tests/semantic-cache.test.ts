import { describe, expect, it } from "vitest";
import {
  SemanticCacheService,
  DeterministicEmbeddingProvider,
  InMemorySemanticVectorStore,
  RequestOptimizationService,
  CacheService,
  evaluateSemanticCacheEligibility,
  extractSemanticInput,
  SemanticCacheCandidateValidator,
  DEFAULT_SEMANTIC_CACHE_POLICY,
} from "../src/index.js";
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";

describe("Phase 24 — Semantic Cache & Request Optimization Platform", () => {
  const embeddingProvider = new DeterministicEmbeddingProvider({
    dimensions: 256,
  });

  function createSemanticService(options?: any) {
    const vectorStore = new InMemorySemanticVectorStore();
    return new SemanticCacheService({
      vectorStore,
      embeddingProvider,
      policy: {
        ...DEFAULT_SEMANTIC_CACHE_POLICY,
        similarityThreshold: 0.85,
        ...options?.policy,
      },
    });
  }

  it("1. Extracts normalized semantic input and computes deterministic namespace hashes", () => {
    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "  Explain   Kubernetes  simply! \n" },
      ],
      temperature: 0,
    };

    const norm = extractSemanticInput({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: req,
    });

    expect(norm.systemPrompt).toBe("You are a helpful assistant.");
    expect(norm.systemPromptHash).toBeDefined();
    expect(norm.semanticText).toBe("Explain Kubernetes simply!");
    expect(norm.namespaceHash).toBeDefined();
  });

  it("2. Correctly enforces hard safety exclusions during eligibility evaluation", () => {
    const policy = { ...DEFAULT_SEMANTIC_CACHE_POLICY };

    // Tool call exclusion
    const toolReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Get weather" }],
      tools: [{ type: "function", function: { name: "get_weather" } }],
    };
    expect(evaluateSemanticCacheEligibility(toolReq, policy).eligible).toBe(
      false,
    );

    // High temperature exclusion without seed
    const highTempReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Write a poem" }],
      temperature: 0.8,
    };
    expect(evaluateSemanticCacheEligibility(highTempReq, policy).eligible).toBe(
      false,
    );

    // High temperature with seed is allowed
    const highTempSeedReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Write a poem" }],
      temperature: 0.8,
      seed: 42,
    };
    expect(
      evaluateSemanticCacheEligibility(highTempSeedReq, policy).eligible,
    ).toBe(true);

    // Temporal / freshness keyword exclusion
    const freshReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "user", content: "What is the latest price of Bitcoin today?" },
      ],
    };
    expect(evaluateSemanticCacheEligibility(freshReq, policy).eligible).toBe(
      false,
    );

    // Multi-turn conversation conservative exclusion
    const multiTurnReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Good" },
        { role: "user", content: "Tell me a joke" },
      ],
    };
    expect(
      evaluateSemanticCacheEligibility(multiTurnReq, policy).eligible,
    ).toBe(false);
  });

  it("3. Successfully admits and produces a semantic hit for semantically equivalent prompts", async () => {
    const service = createSemanticService();

    const originalReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a concise tutor." },
        { role: "user", content: "Explain Kubernetes simply" },
      ],
      temperature: 0,
    };

    const originalResp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-orig",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Kubernetes automates container orchestration.",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
    };

    const stored = await service.admitAndStore({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: originalReq,
      response: originalResp,
      sourceRequestId: "req_101",
    });
    expect(stored).toBe(true);

    // Exact prompt lookup -> HIT
    const exactLookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: originalReq,
    });
    expect(exactLookup.status).toBe("HIT");
    expect(exactLookup.entry?.responsePayload.choices[0]?.message.content).toBe(
      "Kubernetes automates container orchestration.",
    );

    // Rephrased prompt lookup -> HIT
    const rephrasedReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a concise tutor." },
        { role: "user", content: "Explain Kubernetes simply." },
      ],
      temperature: 0,
    };

    const rephrasedLookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: rephrasedReq,
    });
    expect(rephrasedLookup.status).toBe("HIT");
    expect(rephrasedLookup.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("4. Enforces strict multi-tenant and workspace isolation", async () => {
    const service = createSemanticService();

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "What is the capital of France?" }],
      temperature: 0,
    };

    const resp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-paris",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Paris" },
          finish_reason: "stop",
        },
      ],
    };

    await service.admitAndStore({
      organizationId: "org_tenant_A",
      workspaceId: "ws_tenant_A",
      canonicalModel: "openai/gpt-4o",
      request: req,
      response: resp,
      sourceRequestId: "req_a",
    });

    // Org B lookup -> MISS (Tenant isolation)
    const orgBLookup = await service.lookup({
      organizationId: "org_tenant_B",
      workspaceId: "ws_tenant_B",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(orgBLookup.status).toBe("MISS");
    expect(orgBLookup.missReason).toBe("no_candidates");

    // Org A with different workspace -> MISS (Workspace isolation)
    const wsBLookup = await service.lookup({
      organizationId: "org_tenant_A",
      workspaceId: "ws_other",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(wsBLookup.status).toBe("MISS");
  });

  it("5. Rejects candidate on system prompt or policy version mismatch", async () => {
    const service = createSemanticService();

    const reqSystem1: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "Hello world" },
      ],
      temperature: 0,
    };

    const resp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-pirate",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Ahoy matey!" },
          finish_reason: "stop",
        },
      ],
    };

    await service.admitAndStore({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: reqSystem1,
      response: resp,
      sourceRequestId: "req_p",
    });

    // Lookup with different system prompt -> MISS
    const reqSystem2: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: "You are a serious doctor." },
        { role: "user", content: "Hello world" },
      ],
      temperature: 0,
    };

    const lookupDiffSystem = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 1,
      request: reqSystem2,
    });
    expect(lookupDiffSystem.status).toBe("MISS");

    // Lookup with different policy version -> MISS
    const lookupDiffPolicy = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      policyVersion: 2,
      request: reqSystem1,
    });
    expect(lookupDiffPolicy.status).toBe("MISS");
  });

  it("6. Rejects candidate on numeric or negation polarity mismatch", () => {
    const baseEntry: any = {
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      status: "active",
      expiresAt: new Date(Date.now() + 100000),
      systemPromptHash: "sys_hash",
      policyVersion: 1,
      canonicalModel: "openai/gpt-4o",
      semanticText: "Summarize this article in 10 words",
    };

    // Numeric mismatch (10 vs 100)
    const numValidation = SemanticCacheCandidateValidator.validate(baseEntry, {
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      systemPromptHash: "sys_hash",
      policyVersion: 1,
      parametersHash: "p_hash",
      rawUserText: "Summarize this article in 100 words",
    });
    expect(numValidation.valid).toBe(false);
    expect(numValidation.reason).toBe("numeric_mismatch");

    // Negation mismatch (enable vs disable)
    baseEntry.semanticText = "Enable debugging logs";
    const negValidation = SemanticCacheCandidateValidator.validate(baseEntry, {
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      systemPromptHash: "sys_hash",
      policyVersion: 1,
      parametersHash: "p_hash",
      rawUserText: "Disable debugging logs",
    });
    expect(negValidation.valid).toBe(false);
    expect(negValidation.reason).toBe("negation_mismatch");
  });

  it("7. Immediately excludes quarantined entries from hits", async () => {
    const service = createSemanticService();

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Tell me about quantum computing" }],
      temperature: 0,
    };
    const resp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-quantum",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Quantum computers use qubits.",
          },
          finish_reason: "stop",
        },
      ],
    };

    await service.admitAndStore({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
      response: resp,
      sourceRequestId: "req_q",
    });

    const initialHit = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(initialHit.status).toBe("HIT");

    // Quarantine the entry
    await service.quarantine(initialHit.entry!.id);

    const postQuarantineLookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(postQuarantineLookup.status).toBe("MISS");
  });

  it("8. Supports global kill switch and shadow mode", async () => {
    const service = createSemanticService();

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Explain React hooks" }],
      temperature: 0,
    };
    const resp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-react",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hooks allow state in functional components.",
          },
          finish_reason: "stop",
        },
      ],
    };

    await service.admitAndStore({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
      response: resp,
      sourceRequestId: "req_react",
    });

    // Shadow Mode: Returns MISS with isShadowHit: true
    service.setShadowMode(true);
    const shadowLookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(shadowLookup.status).toBe("MISS");
    expect(shadowLookup.isShadowHit).toBe(true);
    expect(shadowLookup.missReason).toBe("shadow_mode");

    // Disable shadow mode, enable kill switch: Returns BYPASS with disabled
    service.setShadowMode(false);
    service.setKillSwitch(true);
    const killLookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });
    expect(killLookup.status).toBe("BYPASS");
    expect(killLookup.missReason).toBe("disabled");
  });

  it("9. Fails open on embedding provider failure without throwing", async () => {
    const brokenEmbeddingProvider = {
      dimensions: 256,
      modelName: "broken-embed",
      async embed(): Promise<readonly number[]> {
        throw new Error("Embedding cluster down 503");
      },
      async embedBatch(): Promise<readonly (readonly number[])[]> {
        throw new Error("Embedding cluster down 503");
      },
    };

    const service = new SemanticCacheService({
      embeddingProvider: brokenEmbeddingProvider,
    });

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Test resilient error handling" }],
      temperature: 0,
    };

    const lookup = await service.lookup({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      canonicalModel: "openai/gpt-4o",
      request: req,
    });

    expect(lookup.status).toBe("MISS");
    expect(lookup.missReason).toBe("embedding_failure");
  });

  it("10. RequestOptimizationService executes exact before semantic check", async () => {
    const exactCache = new CacheService();
    const semanticCache = createSemanticService();
    const optimizer = new RequestOptimizationService(exactCache, semanticCache);

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Explain Redis" }],
      temperature: 0,
    };

    const resp: OpenAIChatCompletionResponse = {
      id: "chatcmpl-redis",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Redis is an in-memory data store.",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Store into both
    await optimizer.admitResponse({
      organizationId: "org_opt",
      workspaceId: "ws_opt",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "p_1",
      request: req,
      response: resp,
      sourceRequestId: "req_redis",
    });

    // 1st request with identical input hits EXACT cache (Stage 1)
    const exactRes = await optimizer.optimizeRequest({
      organizationId: "org_opt",
      workspaceId: "ws_opt",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "p_1",
      request: req,
    });
    expect(exactRes.status).toBe("HIT");
    expect(exactRes.cacheType).toBe("exact");

    // 2nd request with minor rephrasing (exact miss) hits SEMANTIC cache (Stage 2)
    const rephrasedReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Explain Redis." }],
      temperature: 0,
    };

    const semanticRes = await optimizer.optimizeRequest({
      organizationId: "org_opt",
      workspaceId: "ws_opt",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v1",
      policyFingerprint: "p_1",
      request: rephrasedReq,
    });
    expect(semanticRes.status).toBe("HIT");
    expect(semanticRes.cacheType).toBe("semantic");
    expect(semanticRes.responsePayload?.choices[0]?.message.content).toBe(
      "Redis is an in-memory data store.",
    );
  });
});
