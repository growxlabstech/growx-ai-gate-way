import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  ApiKeyService,
  InMemoryApiKeyRepository,
  InMemoryLifecycleEvents,
  generateApiKeyCredentials,
  hashApiKey,
} from "@growx/api-key-service";
import {
  InMemoryModelRegistryRepository,
  InMemoryModelRegistryEvents,
  ModelRegistryService,
} from "@growx/model-registry-service";
import {
  InMemoryProviderRepository,
  InMemoryProviderEvents,
  ProviderCredentialCrypto,
  ProviderService,
} from "@growx/provider-service";
import {
  InMemoryRoutingRepository,
  InMemoryRoutingEvents,
  RoutingEngine,
} from "@growx/routing-service";
import { AdapterRegistry } from "@growx/provider-sdk";
import { InMemoryRouteHealthStore } from "@growx/routing";
import {
  InMemoryCounterStore,
  InMemoryQuotaPolicyRepository,
  QuotaEngine,
  RouteCapacitySignalProvider,
  TokenEstimator,
} from "@growx/rate-limits";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { RoutingEngineRouteResolver } from "../../src/domain/route-resolver.js";
import { GatewayResilienceController } from "../../src/application/resilience-controller.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";
import { MockAdapter, TEST_ENCRYPTION_KEY, TEST_PEPPER } from "../helpers/test-fixture.js";
import { GrowXProviderError } from "@growx/contracts";

class CapacityTestMockAdapter extends MockAdapter {
  public callCount = 0;
  public delayMs = 0;

  constructor(public override readonly providerId: string) {
    super();
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  override async execute(request: any, context: any): Promise<any> {
    this.callCount++;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const now = new Date();
    return {
      requestId: request.requestId,
      canonicalModelId: request.canonicalModelId,
      providerId: context.providerId,
      providerModelId: request.providerModelId,
      providerRequestId: `mock_${this.providerId}_${Date.now()}`,
      output: [
        {
          role: "assistant",
          content: `Hello from ${this.providerId}!`,
        },
      ],
      finishReason: "stop",
      usage: {
        inputTokens: 15,
        outputTokens: 10,
        totalTokens: 25,
        source: "provider_reported",
      },
      timing: {
        startedAt: now,
        completedAt: new Date(now.getTime() + 20),
        latencyMs: 20,
      },
    };
  }
}

describe("Phase 11 — Gateway Capacity & Quota Engine Integration Tests", () => {
  let apiKeyRepo: InMemoryApiKeyRepository;
  let apiKeyService: ApiKeyService;
  let modelRepo: InMemoryModelRegistryRepository;
  let modelService: ModelRegistryService;
  let providerRepo: InMemoryProviderRepository;
  let providerService: ProviderService;
  let routingRepo: InMemoryRoutingRepository;
  let routingEvents: InMemoryRoutingEvents;
  let healthStore: InMemoryRouteHealthStore;
  let counterStore: InMemoryCounterStore;
  let quotaPolicyRepo: InMemoryQuotaPolicyRepository;
  let quotaEngine: QuotaEngine;
  let capacitySignalProvider: RouteCapacitySignalProvider;
  let tokenEstimator: TokenEstimator;
  let routingEngine: RoutingEngine;
  let gatewayRepo: InMemoryGatewayRepository;
  let gatewayEvents: InMemoryGatewayEvents;
  let resilienceController: GatewayResilienceController;
  let gatewayEngine: GatewayEngine;
  let server: Server;
  let baseUrl: string;

  let mockOpenAI: CapacityTestMockAdapter;
  let mockAnthropic: CapacityTestMockAdapter;

  let testApiKey: string;
  let testApiKeyId: string;
  let testOrgId = "org_phase11_test";
  let testWsId = "ws_phase11_test";
  let openAIRouteId: string;
  let anthropicRouteId: string;

  beforeEach(async () => {
    // 1. Api Key Service
    apiKeyRepo = new InMemoryApiKeyRepository();
    const apiKeyEvents = new InMemoryLifecycleEvents();
    apiKeyService = new ApiKeyService(apiKeyRepo, apiKeyEvents, {
      pepper: TEST_PEPPER,
    });

    // 2. Model Registry Service
    modelRepo = new InMemoryModelRegistryRepository();
    const modelEvents = new InMemoryModelRegistryEvents();
    modelService = new ModelRegistryService(modelRepo, modelEvents);

    // 3. Provider Service
    providerRepo = new InMemoryProviderRepository();
    const providerEvents = new InMemoryProviderEvents();
    const crypto = new ProviderCredentialCrypto(TEST_ENCRYPTION_KEY);
    const adapterRegistry = new AdapterRegistry();

    mockOpenAI = new CapacityTestMockAdapter("openai");
    mockAnthropic = new CapacityTestMockAdapter("anthropic");
    adapterRegistry.register(mockOpenAI);
    adapterRegistry.register(mockAnthropic);

    providerService = new ProviderService(
      providerRepo,
      providerEvents,
      crypto,
      adapterRegistry
    );

    // 4. Rate Limits & Quota Engine
    counterStore = new InMemoryCounterStore();
    quotaPolicyRepo = new InMemoryQuotaPolicyRepository();
    tokenEstimator = new TokenEstimator();
    capacitySignalProvider = new RouteCapacitySignalProvider(counterStore, quotaPolicyRepo);
    quotaEngine = new QuotaEngine(counterStore, quotaPolicyRepo);

    // 5. Health Store & Routing Engine
    healthStore = new InMemoryRouteHealthStore();
    routingRepo = new InMemoryRoutingRepository();
    routingEvents = new InMemoryRoutingEvents();

    routingEngine = new RoutingEngine(
      modelService,
      providerService,
      routingRepo,
      routingEvents,
      {
        routeHealthStore: healthStore,
        capacitySignalProvider: capacitySignalProvider as any,
      }
    );

    // 6. Gateway Engine & Resilience Controller
    gatewayRepo = new InMemoryGatewayRepository();
    gatewayEvents = new InMemoryGatewayEvents();

    resilienceController = new GatewayResilienceController(
      modelService,
      providerService,
      gatewayRepo,
      gatewayEvents,
      {
        routeHealthStore: healthStore,
        quotaEngine,
        tokenEstimator,
      }
    );

    const routeResolver = new RoutingEngineRouteResolver(routingEngine);

    gatewayEngine = new GatewayEngine(
      modelService,
      providerService,
      gatewayRepo,
      gatewayEvents,
      routeResolver,
      undefined,
      resilienceController,
      quotaEngine,
      tokenEstimator
    );

    // 7. HTTP Server
    const app = createGatewayServer({
      apiKeyService,
      modelRegistry: modelService,
      gatewayEngine,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 8. Seed Providers
    const openAIProvider = await providerService.createProvider(
      {
        code: "openai",
        displayName: "OpenAI Provider",
        adapterType: "openai",
        baseUrl: "https://api.openai.com",
        priority: 1,
        enabled: true,
        status: "active",
      },
      "usr_admin"
    );

    await providerService.createCredential(
      openAIProvider.id,
      {
        name: "OpenAI Prod Key",
        environment: "production",
        rawSecret: "sk-openai-test-key",
        encryptionKeyVersion: "v1",
      },
      "usr_admin"
    );

    const anthropicProvider = await providerService.createProvider(
      {
        code: "anthropic",
        displayName: "Anthropic Provider",
        adapterType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        priority: 2,
        enabled: true,
        status: "active",
      },
      "usr_admin"
    );

    await providerService.createCredential(
      anthropicProvider.id,
      {
        name: "Anthropic Prod Key",
        environment: "production",
        rawSecret: "sk-ant-test-key",
        encryptionKeyVersion: "v1",
      },
      "usr_admin"
    );

    // 9. Seed Canonical Model & Routes
    const model = await modelService.createModel(
      {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming"],
      },
      "usr_admin"
    );

    const r1 = await modelService.addProviderRoute(
      {
        modelId: model.id,
        providerId: openAIProvider.id,
        providerModelId: "gpt-4o",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 1,
      },
      "usr_admin"
    );
    openAIRouteId = r1.id;

    const r2 = await modelService.addProviderRoute(
      {
        modelId: model.id,
        providerId: anthropicProvider.id,
        providerModelId: "claude-3-5-sonnet",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 2,
      },
      "usr_admin"
    );
    anthropicRouteId = r2.id;

    // 10. Seed Alias
    await modelService.createAlias(
      {
        alias: "growx-smart",
        canonicalModelId: "openai/gpt-4o",
        type: "product",
        description: "Primary Smart Route",
      },
      "usr_admin"
    );

    // 11. Create Test API Key
    const creds = generateApiKeyCredentials("production");
    testApiKey = creds.fullSecret;
    testApiKeyId = creds.id;

    await apiKeyRepo.insert({
      id: creds.id,
      organizationId: testOrgId,
      workspaceId: testWsId,
      environmentId: "env_prod",
      environment: "production",
      name: "Phase 11 Capacity Key",
      prefix: creds.prefix,
      secretHash: hashApiKey(creds.secretPart, TEST_PEPPER),
      status: "active",
      permissions: ["chat.completions.create", "models.read"],
      modelRules: [],
      ipAllowlist: [],
      rateLimits: [],
      createdBy: "usr_test",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });

    apiKeyRepo.setTenantState(testOrgId, {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects customer request with 429 when API-key RPM is exceeded, making 0 provider calls", async () => {
    // Set API-key limit: 2 RPM
    await quotaPolicyRepo.saveLimit({
      scopeType: "api_key",
      scopeId: testApiKeyId,
      dimension: "requests",
      windowSeconds: 60,
      limit: 2,
      hard: true,
      enabled: true,
    });

    // Request 1: Succeeded
    const res1 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Hello 1" }],
      }),
    });
    expect(res1.status).toBe(200);

    // Request 2: Succeeded
    const res2 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Hello 2" }],
      }),
    });
    expect(res2.status).toBe(200);

    const providerCallsBefore = mockOpenAI.callCount;

    // Request 3: Denied with 429
    const res3 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Hello 3" }],
      }),
    });

    expect(res3.status).toBe(429);
    const body3 = (await res3.json()) as any;
    expect(body3.error.type).toBe("rate_limit_error");
    expect(body3.error.code).toBe("rate_limit_exceeded");

    // Zero provider calls on rejected request!
    expect(mockOpenAI.callCount).toBe(providerCallsBefore);
  });

  it("rejects customer request when estimated tokens exceed Workspace TPM limit", async () => {
    // Set Workspace TPM limit: 400 tokens
    await quotaPolicyRepo.saveLimit({
      scopeType: "workspace",
      scopeId: testWsId,
      dimension: "total_tokens",
      windowSeconds: 60,
      limit: 400,
      hard: true,
      enabled: true,
    });

    // Request reserving 1000 max_tokens exceeds 400 TPM limit -> Denied with 429
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Short message" }],
        max_tokens: 1000,
      }),
    });

    expect(res.status).toBe(429);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("token_rate_limit_exceeded");
  });

  it("enforces concurrent request limits and releases concurrency upon completion", async () => {
    // Set Workspace concurrency limit: 1
    await quotaPolicyRepo.saveLimit({
      scopeType: "workspace",
      scopeId: testWsId,
      dimension: "concurrent_requests",
      windowSeconds: 0,
      limit: 1,
      hard: true,
      enabled: true,
    });

    mockOpenAI.setDelay(100);

    // Launch request 1
    const p1 = fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Long task 1" }],
      }),
    });

    // Request 2 immediately in parallel -> Rejected due to concurrency limit 1
    const res2 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Task 2" }],
      }),
    });

    expect(res2.status).toBe(429);
    const body2 = (await res2.json()) as any;
    expect(body2.error.code).toBe("concurrency_limit_exceeded");

    // Wait for request 1 to complete
    const res1 = await p1;
    expect(res1.status).toBe(200);

    // Request 3 now succeeds since concurrency permit was released
    mockOpenAI.setDelay(0);
    const res3 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Task 3" }],
      }),
    });
    expect(res3.status).toBe(200);
  });

  it("automatically falls back to secondary route when primary route capacity is exhausted", async () => {
    // Restrict OpenAI Route (Priority 1) to 1 attempt
    await quotaPolicyRepo.saveLimit({
      scopeType: "provider_route",
      scopeId: openAIRouteId,
      dimension: "requests",
      windowSeconds: 60,
      limit: 1,
      hard: true,
      enabled: true,
    });

    // Request 1 uses OpenAI route
    const res1 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Call 1" }],
      }),
    });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as any;
    expect(body1.choices[0]?.message.content).toContain("openai");

    // Request 2: OpenAI route capacity exhausted -> Automatically falls back to Anthropic route!
    const res2 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${testApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "growx-smart",
        messages: [{ role: "user", content: "Call 2" }],
      }),
    });

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.choices[0]?.message.content).toContain("anthropic");
  });

  it("handles internal quota management and capacity inspection endpoints", async () => {
    // 1. Create a quota policy via HTTP POST /internal/quota/policies
    const postRes = await fetch(`${baseUrl}/internal/quota/policies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scopeType: "organization",
        scopeId: "org_custom",
        dimension: "requests",
        windowSeconds: 60,
        limit: 500,
        hard: true,
        enabled: true,
      }),
    });
    expect(postRes.status).toBe(201);
    const postBody = (await postRes.json()) as any;
    expect(postBody.success).toBe(true);
    expect(postBody.policy.id).toBeDefined();

    // 2. List policies via GET /internal/quota/policies
    const listRes = await fetch(`${baseUrl}/internal/quota/policies?scopeType=organization`);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.policies.length).toBeGreaterThan(0);

    // 3. Inspect route capacity metrics via GET /internal/capacity/routes/:id
    const capRes = await fetch(`${baseUrl}/internal/capacity/routes/${openAIRouteId}`);
    expect(capRes.status).toBe(200);
    const capBody = (await capRes.json()) as any;
    expect(capBody.routeId).toBe(openAIRouteId);
    expect(capBody.metrics).toBeDefined();
  });
});
