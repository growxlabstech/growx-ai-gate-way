import { describe, expect, it } from "vitest";
import {
  InMemoryPolicyCache,
  InMemoryPolicyRepository,
  PolicyEngine,
  type PolicyEvaluationContext,
  compileEffectivePolicy,
  isRegionAllowed,
} from "../src/index.js";

describe("Phase 12 — Policy Engine Unit & Precedence Tests", () => {
  const baseContext: PolicyEvaluationContext = {
    organizationId: "org_alpha",
    workspaceId: "ws_alpha_1",
    apiKeyId: "key_alpha_1",
    requestedModel: "gpt-4o",
    canonicalModel: {
      id: "mod_gpt4o",
      canonicalId: "openai/gpt-4o",
      family: "gpt",
      category: "chat",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    tools: [
      {
        type: "function",
        function: { name: "search_database" },
      },
    ],
    temperature: 0.7,
    maxTokens: 2048,
  };

  it("1. compiles hierarchy with strict precedence: Global -> Org -> Workspace -> API Key with Deny Overrides Allow", () => {
    const hierarchy = [
      {
        scopeType: "global" as const,
        policyId: "pol_global",
        version: 1,
        definition: {
          rules: [
            {
              target: "model" as const,
              effect: "allow" as const,
              operator: "in" as const,
              value: ["openai/gpt-4o", "anthropic/claude-3-5-sonnet", "google/gemini-1.5-pro"],
            },
            {
              target: "provider" as const,
              effect: "deny" as const,
              operator: "in" as const,
              value: ["untrusted_provider"],
            },
          ],
        },
      },
      {
        scopeType: "organization" as const,
        scopeId: "org_alpha",
        policyId: "pol_org",
        version: 1,
        definition: {
          rules: [
            {
              target: "model" as const,
              effect: "allow" as const,
              operator: "in" as const,
              value: ["openai/gpt-4o", "anthropic/claude-3-5-sonnet"],
            },
          ],
        },
      },
      {
        scopeType: "workspace" as const,
        scopeId: "ws_alpha_1",
        policyId: "pol_ws",
        version: 1,
        definition: {
          rules: [
            {
              target: "model" as const,
              effect: "allow" as const,
              operator: "in" as const,
              value: ["openai/gpt-4o"],
            },
            {
              target: "max_output_tokens" as const,
              effect: "allow" as const,
              operator: "less_than_or_equal" as const,
              value: 2048,
            },
          ],
        },
      },
    ];

    const effective = compileEffectivePolicy(hierarchy);

    // Model allowlist was intersected: Global [A, B, C] ∩ Org [A, B] ∩ Ws [A] = [A]
    expect(effective.constraints.allowedModels).toEqual(["openai/gpt-4o"]);
    // Provider deny was inherited from Global
    expect(effective.constraints.deniedProviders).toEqual(["untrusted_provider"]);
    // Strictest output ceiling
    expect(effective.constraints.maxOutputTokens).toBe(2048);
    // Version fingerprint is stable
    expect(effective.versionHash).toBeDefined();
    expect(effective.versionHash.length).toBe(16);
  });

  it("2. enforces parent mandatory deny over child allow (Deny Overrides Allow)", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    // Global policy explicitly denies Anthropic
    const { policy: globalPol } = await repo.createPolicy({
      scopeType: "global",
      name: "Global Security Guardrail",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "provider",
            effect: "deny",
            operator: "in",
            value: ["anthropic"],
          },
        ],
      },
    });

    // Workspace policy attempts to allow Anthropic
    await repo.createPolicy({
      scopeType: "workspace",
      scopeId: "ws_alpha_1",
      name: "Workspace Policy",
      createdBy: "usr_lead",
      definition: {
        rules: [
          {
            target: "provider",
            effect: "allow",
            operator: "in",
            value: ["anthropic", "openai"],
          },
        ],
      },
    });

    const routeDecision = await engine.evaluateRoutes(baseContext, [
      {
        routeId: "rt_ant",
        providerId: "anthropic",
        providerModelId: "claude-3-5-sonnet",
      },
      {
        routeId: "rt_oai",
        providerId: "openai",
        providerModelId: "gpt-4o",
      },
    ]);

    expect(routeDecision.eligible.map((r) => r.providerId)).toEqual(["openai"]);
    expect(routeDecision.excluded).toHaveLength(1);
    expect(routeDecision.excluded[0]?.denialCode).toBe("PROVIDER_DENIED");
    expect(routeDecision.excluded[0]?.reason).toContain("explicitly denied by provider governance policy");
  });

  it("3. denies request when canonical model is not in approved allowlist or is denied", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    await repo.createPolicy({
      scopeType: "organization",
      scopeId: "org_alpha",
      name: "Approved Models Only",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "model",
            effect: "allow",
            operator: "in",
            value: ["meta/llama-3-70b"],
          },
        ],
      },
    });

    const decision = await engine.evaluateRequest(baseContext);
    expect(decision.allowed).toBe(false);
    expect(decision.denialCode).toBe("MODEL_DENIED");
    expect(decision.reasons[0]).toContain("not in the approved model allowlist");
  });

  it("4. enforces model category and family governance", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    await repo.createPolicy({
      scopeType: "organization",
      scopeId: "org_alpha",
      name: "Deny Chat Models",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "model_category",
            effect: "deny",
            operator: "equals",
            value: "chat",
          },
        ],
      },
    });

    const decision = await engine.evaluateRequest(baseContext);
    expect(decision.allowed).toBe(false);
    expect(decision.denialCode).toBe("MODEL_CATEGORY_DENIED");
  });

  it("5. enforces regional and data residency constraints including region groups (EU / IN / US)", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    // Organization requires India data residency
    await repo.createPolicy({
      scopeType: "organization",
      scopeId: "org_alpha",
      name: "India Data Residency",
      createdBy: "usr_compliance",
      definition: {
        rules: [
          {
            target: "data_residency",
            effect: "allow",
            operator: "equals",
            value: "IN",
          },
        ],
      },
    });

    const routeDecision = await engine.evaluateRoutes(baseContext, [
      {
        routeId: "rt_mumbai",
        providerId: "openai",
        providerModelId: "gpt-4o",
        region: "ap-south-1", // Mumbai -> matches IN group
      },
      {
        routeId: "rt_virginia",
        providerId: "openai",
        providerModelId: "gpt-4o",
        region: "us-east-1", // Virginia -> does not match IN group
      },
    ]);

    expect(routeDecision.eligible).toHaveLength(1);
    expect(routeDecision.eligible[0]?.routeId).toBe("rt_mumbai");
    expect(routeDecision.excluded[0]?.denialCode).toBe("DATA_RESIDENCY_DENIED");
  });

  it("6. enforces tool governance: tools allowed/disabled, specific tool names, max tool count", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    // Deny shell execution tool
    await repo.createPolicy({
      scopeType: "workspace",
      scopeId: "ws_alpha_1",
      name: "Tool Restrictions",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "tool_name",
            effect: "deny",
            operator: "equals",
            value: "execute_shell",
          },
          {
            target: "max_tools",
            effect: "allow",
            operator: "less_than_or_equal",
            value: 2,
          },
        ],
      },
    });

    // Request with approved tool
    const allowedRes = await engine.evaluateRequest({
      ...baseContext,
      tools: [{ type: "function", function: { name: "search_database" } }],
    });
    expect(allowedRes.allowed).toBe(true);

    // Request with prohibited tool
    const deniedToolRes = await engine.evaluateRequest({
      ...baseContext,
      tools: [{ type: "function", function: { name: "execute_shell" } }],
    });
    expect(deniedToolRes.allowed).toBe(false);
    expect(deniedToolRes.denialCode).toBe("TOOL_DENIED");

    // Request with too many tools
    const maxToolRes = await engine.evaluateRequest({
      ...baseContext,
      tools: [
        { type: "function", function: { name: "t1" } },
        { type: "function", function: { name: "t2" } },
        { type: "function", function: { name: "t3" } },
      ],
    });
    expect(maxToolRes.allowed).toBe(false);
    expect(maxToolRes.denialCode).toBe("REQUEST_LIMIT_DENIED");
  });

  it("7. enforces modality, structured output, reasoning, and request limits", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    await repo.createPolicy({
      scopeType: "workspace",
      scopeId: "ws_alpha_1",
      name: "Feature Restrictions",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "input_modality",
            effect: "deny",
            operator: "in",
            value: ["image", "audio"],
          },
          {
            target: "reasoning",
            effect: "deny",
            operator: "equals",
            value: true,
          },
          {
            target: "max_output_tokens",
            effect: "allow",
            operator: "less_than_or_equal",
            value: 1000,
          },
        ],
      },
    });

    // Image input denied
    const imgRes = await engine.evaluateRequest({
      ...baseContext,
      inputModalities: ["text", "image"],
    });
    expect(imgRes.allowed).toBe(false);
    expect(imgRes.denialCode).toBe("MODALITY_DENIED");

    // Reasoning denied
    const reasonRes = await engine.evaluateRequest({
      ...baseContext,
      inputModalities: ["text"],
      reasoning: { effort: "high", maxTokens: 4000 },
    });
    expect(reasonRes.allowed).toBe(false);
    expect(reasonRes.denialCode).toBe("REASONING_DENIED");

    // Output tokens exceed limit
    const tokenRes = await engine.evaluateRequest({
      ...baseContext,
      inputModalities: ["text"],
      reasoning: undefined,
      maxTokens: 2000,
    });
    expect(tokenRes.allowed).toBe(false);
    expect(tokenRes.denialCode).toBe("REQUEST_LIMIT_DENIED");
  });

  it("8. enforces cost ceilings and fails safe on unknown pricing", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    await repo.createPolicy({
      scopeType: "workspace",
      scopeId: "ws_alpha_1",
      name: "Cost Ceiling",
      createdBy: "usr_admin",
      definition: {
        rules: [
          {
            target: "max_cost_per_request",
            effect: "allow",
            operator: "less_than_or_equal",
            value: 0.05, // $0.05 max per request
          },
        ],
      },
    });

    const routeRes = await engine.evaluateRoutes(baseContext, [
      {
        routeId: "rt_cheap",
        providerId: "openai",
        providerModelId: "gpt-4o-mini",
        estimatedCost: 0.002,
      },
      {
        routeId: "rt_expensive",
        providerId: "openai",
        providerModelId: "gpt-4o",
        estimatedCost: 0.12,
      },
      {
        routeId: "rt_unknown",
        providerId: "anthropic",
        providerModelId: "claude-3-opus",
        estimatedCost: undefined, // Unknown price fails safe!
      },
    ]);

    expect(routeRes.eligible).toHaveLength(1);
    expect(routeRes.eligible[0]?.routeId).toBe("rt_cheap");
    expect(routeRes.excluded).toHaveLength(2);
    expect(routeRes.excluded.every((e) => e.denialCode === "COST_POLICY_DENIED")).toBe(true);
  });

  it("9. provides caching with automatic scope invalidation on policy mutations", async () => {
    const repo = new InMemoryPolicyRepository();
    const cache = new InMemoryPolicyCache({ defaultTtlSeconds: 60 });
    const engine = new PolicyEngine(repo, { cache });

    // 1. Initial Evaluation (cache miss)
    const dec1 = await engine.evaluateRequest(baseContext);
    expect(dec1.allowed).toBe(true);
    expect(cache.getMetrics().misses).toBe(1);

    // 2. Second Evaluation (cache hit)
    const dec2 = await engine.evaluateRequest(baseContext);
    expect(dec2.allowed).toBe(true);
    expect(cache.getMetrics().hits).toBe(1);

    // 3. Mutate workspace policy -> Invalidates workspace cache
    const { policy } = await engine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: "ws_alpha_1",
        name: "Deny OpenAI",
        createdBy: "usr_admin",
        definition: {
          rules: [
            {
              target: "model",
              effect: "deny",
              operator: "equals",
              value: "openai/gpt-4o",
            },
          ],
        },
      },
      "usr_admin"
    );

    // 4. Third Evaluation -> Cache was invalidated -> Evaluates fresh policy -> Immediately denied!
    const dec3 = await engine.evaluateRequest(baseContext);
    expect(dec3.allowed).toBe(false);
    expect(dec3.denialCode).toBe("MODEL_DENIED");
  });

  it("10. supports policy simulation without side-effects", async () => {
    const repo = new InMemoryPolicyRepository();
    const engine = new PolicyEngine(repo);

    const simulation = await engine.simulatePolicy(baseContext, [
      {
        routeId: "rt_1",
        providerId: "openai",
        providerModelId: "gpt-4o",
      },
    ]);

    expect(simulation.requestDecision.allowed).toBe(true);
    expect(simulation.routeEvaluation?.eligible).toHaveLength(1);
    expect(simulation.effectiveConstraints).toBeDefined();
  });
});
