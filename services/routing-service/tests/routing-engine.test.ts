import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryModelRegistryEvents,
  InMemoryModelRegistryRepository,
  ModelRegistryService,
} from "@growx/model-registry-service";
import {
  InMemoryProviderEvents,
  InMemoryProviderRepository,
  ProviderCredentialCrypto,
  ProviderService,
} from "@growx/provider-service";
import { AdapterRegistry } from "@growx/provider-sdk";
import { RoutingEngine } from "../src/application/routing-engine.js";
import { InMemoryRoutingEvents } from "../src/infrastructure/events.js";
import { InMemoryRoutingRepository } from "../src/infrastructure/in-memory-repository.js";
import {
  InMemoryAvailabilitySignalStore,
  InMemoryLatencySignalStore,
} from "../src/infrastructure/signals.js";
import type { RoutingEngineContext } from "../src/domain/types.js";

describe("RoutingEngine", () => {
  let modelRepo: InMemoryModelRegistryRepository;
  let modelEvents: InMemoryModelRegistryEvents;
  let modelRegistry: ModelRegistryService;

  let providerRepo: InMemoryProviderRepository;
  let providerEvents: InMemoryProviderEvents;
  let providerService: ProviderService;

  let routingRepo: InMemoryRoutingRepository;
  let routingEvents: InMemoryRoutingEvents;
  let latencyStore: InMemoryLatencySignalStore;
  let availabilityStore: InMemoryAvailabilitySignalStore;

  let engine: RoutingEngine;

  beforeEach(async () => {
    modelRepo = new InMemoryModelRegistryRepository();
    modelEvents = new InMemoryModelRegistryEvents();
    modelRegistry = new ModelRegistryService(modelRepo, modelEvents);

    providerRepo = new InMemoryProviderRepository();
    providerEvents = new InMemoryProviderEvents();
    const crypto = new ProviderCredentialCrypto(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    providerService = new ProviderService(
      providerRepo,
      providerEvents,
      crypto,
      new AdapterRegistry(),
    );

    routingRepo = new InMemoryRoutingRepository();
    routingEvents = new InMemoryRoutingEvents();
    latencyStore = new InMemoryLatencySignalStore();
    availabilityStore = new InMemoryAvailabilitySignalStore();

    engine = new RoutingEngine(
      modelRegistry,
      providerService,
      routingRepo,
      routingEvents,
      {
        latencySignalProvider: latencyStore,
        availabilitySignalProvider: availabilityStore,
      },
    );

    // 1. Create Providers: OpenAI and Anthropic
    const provOpenAI = await providerService.createProvider(
      {
        code: "openai",
        displayName: "OpenAI",
        adapterType: "openai",
        baseUrl: "https://api.openai.com/v1",
        region: "global",
        priority: 100,
        enabled: true,
        status: "active",
      },
      "usr_admin",
    );

    const provAnthropic = await providerService.createProvider(
      {
        code: "anthropic",
        displayName: "Anthropic",
        adapterType: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        region: "global",
        priority: 100,
        enabled: true,
        status: "active",
      },
      "usr_admin",
    );

    // 2. Create Credentials for both
    await providerService.createCredential(
      provOpenAI.id,
      {
        name: "default",
        environment: "production",
        rawSecret: "sk-openai-test-key",
      },
      "usr_admin",
    );

    await providerService.createCredential(
      provAnthropic.id,
      {
        name: "default",
        environment: "production",
        rawSecret: "sk-ant-test-key",
      },
      "usr_admin",
    );

    // 3. Create Canonical Model: growx/smart
    const model = await modelRegistry.createModel(
      {
        canonicalId: "growx/smart",
        displayName: "GrowX Smart Model",
        family: "general",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: true,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming", "tools.call"],
      },
      "usr_admin",
    );

    // 4. Create Provider Routes for the model
    // Route 1: OpenAI (priority 20)
    await modelRegistry.addProviderRoute(
      {
        modelId: model.id,
        providerId: provOpenAI.id,
        providerModelId: "gpt-4o",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 20,
      },
      "usr_admin",
    );

    // Route 2: Anthropic (priority 10 - higher priority by default)
    await modelRegistry.addProviderRoute(
      {
        modelId: model.id,
        providerId: provAnthropic.id,
        providerModelId: "claude-3-5-sonnet",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 10,
      },
      "usr_admin",
    );

    // 5. Create Pricing for model
    await modelRegistry.addPricing(
      {
        modelId: model.id,
        inputPricePerMillionMinor: 250, // $2.50
        outputPricePerMillionMinor: 1000, // $10.00
        currency: "USD",
        source: "manual",
      },
      "usr_admin",
    );
  });

  const createContext = (
    overrides: Partial<RoutingEngineContext> = {},
  ): RoutingEngineContext => {
    return {
      requestId: "req_test_123",
      auth: {
        apiKeyId: "key_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        environmentId: "env_1",
        environment: "production",
        permissions: ["chat.completions.create"],
        modelRules: [],
        ipAllowlist: [],
        rateLimits: [],
      } as any,
      resolvedModel: {
        requestedModelId: "growx/smart",
        canonicalModelId: "growx/smart",
        model: {
          id: "m_1",
          canonicalId: "growx/smart",
          displayName: "GrowX Smart",
          family: "general",
          category: "chat",
          status: "active",
          customerVisible: true,
          routingEligible: true,
          contextWindow: 128_000,
          maxOutputTokens: 8_192,
          supportsStreaming: true,
          supportsTools: true,
          supportsStructuredOutput: true,
          supportsReasoning: true,
          inputModalities: ["text"],
          outputModalities: ["text"],
          capabilities: ["text.generate", "streaming", "tools.call"],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        capabilities: ["text.generate", "streaming", "tools.call"],
        limits: {
          contextWindow: 128_000,
          maxInputTokens: null,
          maxOutputTokens: 8_192,
        },
        eligibleConfiguredRoutes: [],
        isExecutable: true,
      },
      requiredCapabilities: ["text.generate", "streaming"],
      stream: true,
      ...overrides,
    };
  };

  it("selects highest priority route by default (priority strategy)", async () => {
    // Resolve model context from ModelRegistry
    const resolvedContext = await modelRegistry.resolve("growx/smart");
    const ctx = createContext({ resolvedModel: resolvedContext });

    const result = await engine.route(ctx);
    expect(result.selectedRoute.providerModelId).toBe("claude-3-5-sonnet"); // priority 10 < priority 20
    expect(result.decision.strategy).toBe("priority");
    expect(result.decision.selectedProviderModelId).toBe("claude-3-5-sonnet");
    expect(result.decision.candidateCount).toBe(2);
    expect(result.decision.eligibleCandidateCount).toBe(2);
    expect(result.decision.fallbackChain.length).toBe(1);

    // Verify decision was saved
    const saved = await routingRepo.getDecisionByRequestId("req_test_123");
    expect(saved).not.toBeNull();
    expect(saved?.selectedProviderModelId).toBe("claude-3-5-sonnet");
  });

  it("selects lowest latency route when strategy is lowest_latency", async () => {
    const resolvedContext = await modelRegistry.resolve("growx/smart");

    // Configure workspace policy for lowest_latency
    await routingRepo.savePolicy({
      id: "pol_ws_lat",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Lowest Latency Policy",
      strategy: "lowest_latency",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Record latency signals: OpenAI is 25ms, Anthropic is 180ms
    const routes = resolvedContext.eligibleConfiguredRoutes;
    const openAIRoute = routes.find((r) => r.providerModelId === "gpt-4o")!;
    const anthropicRoute = routes.find(
      (r) => r.providerModelId === "claude-3-5-sonnet",
    )!;

    latencyStore.recordLatency(openAIRoute.providerId, "gpt-4o", 25);
    latencyStore.recordLatency(
      anthropicRoute.providerId,
      "claude-3-5-sonnet",
      180,
    );

    const ctx = createContext({ resolvedModel: resolvedContext });
    const result = await engine.route(ctx);

    expect(result.selectedRoute.providerModelId).toBe("gpt-4o"); // 25ms < 180ms
    expect(result.decision.strategy).toBe("lowest_latency");
  });

  it("enforces tenant deniedProviders policy", async () => {
    const resolvedContext = await modelRegistry.resolve("growx/smart");
    const routes = resolvedContext.eligibleConfiguredRoutes;
    const anthropicRoute = routes.find(
      (r) => r.providerModelId === "claude-3-5-sonnet",
    )!;

    // Deny Anthropic in workspace policy
    await routingRepo.savePolicy({
      id: "pol_ws_deny",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Deny Anthropic",
      strategy: "priority",
      deniedProviders: [anthropicRoute.providerId],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createContext({ resolvedModel: resolvedContext });
    const result = await engine.route(ctx);

    // Anthropic was highest priority, but is denied by policy -> selects OpenAI
    expect(result.selectedRoute.providerModelId).toBe("gpt-4o");

    const considered = result.decision.consideredRoutes.find(
      (c) => c.providerId === anthropicRoute.providerId,
    );
    expect(considered?.eligible).toBe(false);
    expect(considered?.exclusionReason).toBe("PROVIDER_DENIED");
  });

  it("throws 503 NO_ELIGIBLE_ROUTE when all routes are denied", async () => {
    const resolvedContext = await modelRegistry.resolve("growx/smart");
    const routes = resolvedContext.eligibleConfiguredRoutes;

    // Deny all providers in workspace policy
    await routingRepo.savePolicy({
      id: "pol_ws_deny_all",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Deny All",
      strategy: "priority",
      deniedProviders: routes.map((r) => r.providerId),
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createContext({ resolvedModel: resolvedContext });
    await expect(engine.route(ctx)).rejects.toThrow(
      "No eligible provider routes available",
    );
  });

  it("supports simulation without side effects", async () => {
    const resolvedContext = await modelRegistry.resolve("growx/smart");
    const ctx = createContext({ resolvedModel: resolvedContext });

    const decision = await engine.simulate(ctx);
    expect(decision.selectedProviderModelId).toBe("claude-3-5-sonnet");
    expect(decision.strategy).toBe("priority");
  });
});
