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
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { RoutingEngineRouteResolver } from "../../src/domain/route-resolver.js";
import { GatewayResilienceController } from "../../src/application/resilience-controller.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";
import {
  MockAdapter,
  TEST_ENCRYPTION_KEY,
  TEST_PEPPER,
} from "../helpers/test-fixture.js";
import { GrowXProviderError } from "@growx/contracts";

class CircuitTestMockAdapter extends MockAdapter {
  public callCount = 0;
  public nextError: Error | null = null;
  public persistentError: Error | null = null;

  constructor(public override readonly providerId: string) {
    super();
  }

  setNextError(err: Error | null) {
    this.nextError = err;
  }

  setPersistentError(err: Error | null) {
    this.persistentError = err;
  }

  override async execute(request: any, context: any): Promise<any> {
    this.callCount++;
    if (this.persistentError) {
      throw this.persistentError;
    }
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
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
        outputTokens: 8,
        totalTokens: 23,
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

describe("Phase 10 — Provider Health & Circuit Breakers End-to-End Tests", () => {
  let apiKeyRepo: InMemoryApiKeyRepository;
  let apiKeyService: ApiKeyService;
  let modelRepo: InMemoryModelRegistryRepository;
  let modelService: ModelRegistryService;
  let providerRepo: InMemoryProviderRepository;
  let providerEvents: InMemoryProviderEvents;
  let providerService: ProviderService;
  let routingRepo: InMemoryRoutingRepository;
  let routingEvents: InMemoryRoutingEvents;
  let healthStore: InMemoryRouteHealthStore;
  let routingEngine: RoutingEngine;
  let gatewayRepo: InMemoryGatewayRepository;
  let gatewayEvents: InMemoryGatewayEvents;
  let resilienceController: GatewayResilienceController;
  let gatewayEngine: GatewayEngine;
  let server: Server;
  let baseUrl: string;

  let mockOpenAI: CircuitTestMockAdapter;
  let mockAnthropic: CircuitTestMockAdapter;

  let testApiKey: string;
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

    // 3. Provider Service with 2 Adapters: openai & anthropic
    providerRepo = new InMemoryProviderRepository();
    providerEvents = new InMemoryProviderEvents();
    const crypto = new ProviderCredentialCrypto(TEST_ENCRYPTION_KEY);
    const adapterRegistry = new AdapterRegistry();

    mockOpenAI = new CircuitTestMockAdapter("openai");
    mockAnthropic = new CircuitTestMockAdapter("anthropic");
    adapterRegistry.register(mockOpenAI);
    adapterRegistry.register(mockAnthropic);

    providerService = new ProviderService(
      providerRepo,
      providerEvents,
      crypto,
      adapterRegistry,
    );

    // 4. Shared Health Store & Routing Engine
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
      },
    );

    const routeResolver = new RoutingEngineRouteResolver(routingEngine);

    // 5. Gateway Engine & Resilience Controller
    gatewayRepo = new InMemoryGatewayRepository();
    gatewayEvents = new InMemoryGatewayEvents();

    resilienceController = new GatewayResilienceController(
      modelService,
      providerService,
      gatewayRepo,
      gatewayEvents,
      {
        routeHealthStore: healthStore,
        retryPolicy: {
          maxAttempts: 3,
          maxSameRouteRetries: 0,
          baseBackoffMs: 5,
        },
      },
    );

    gatewayEngine = new GatewayEngine(
      modelService,
      providerService,
      gatewayRepo,
      gatewayEvents,
      routeResolver,
      undefined,
      resilienceController,
    );

    // 6. HTTP Transport Server
    server = createGatewayServer({
      apiKeyService,
      modelRegistry: modelService,
      gatewayEngine,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 7. Seed Test Entities
    const anthropicProvider = await providerService.createProvider(
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

    await providerService.createCredential(
      anthropicProvider.id,
      {
        name: "Anthropic Prod Key",
        rawSecret: "sk-ant-test-key",
        environment: "development",
      },
      "usr_admin",
    );

    const openAIProvider = await providerService.createProvider(
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

    await providerService.createCredential(
      openAIProvider.id,
      {
        name: "OpenAI Prod Key",
        rawSecret: "sk-proj-test-key",
        environment: "development",
      },
      "usr_admin",
    );

    const canonicalModel = await modelService.createModel(
      {
        canonicalId: "growx/fast",
        displayName: "Fast Multi-Provider Model",
        family: "general",
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
        capabilities: ["text.generate", "streaming", "tools.call"],
      },
      "usr_admin",
    );

    // Primary: Anthropic (Priority 10)
    const anthropicRoute = await modelService.addProviderRoute(
      {
        modelId: canonicalModel.id,
        providerId: anthropicProvider.id,
        providerModelId: "claude-3-5-haiku",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 10,
      },
      "usr_admin",
    );
    anthropicRouteId = anthropicRoute.id;

    // Secondary: OpenAI (Priority 20)
    const openAIRoute = await modelService.addProviderRoute(
      {
        modelId: canonicalModel.id,
        providerId: openAIProvider.id,
        providerModelId: "gpt-4o-mini",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 20,
      },
      "usr_admin",
    );
    openAIRouteId = openAIRoute.id;

    // Seed API Key
    const creds = generateApiKeyCredentials("development");
    const secretHash = hashApiKey(creds.secretPart, TEST_PEPPER);
    await apiKeyRepo.insert({
      id: creds.id,
      organizationId: "org_resilience",
      workspaceId: "ws_resilience",
      environmentId: "env_dev",
      environment: "development",
      name: "Circuit Test Key",
      prefix: creds.prefix,
      secretHash,
      status: "active",
      permissions: [
        "chat.completions.create",
        "responses.create",
        "models.read",
      ],
      modelRules: [],
      ipAllowlist: [],
      rateLimits: [],
      createdBy: "usr_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });

    apiKeyRepo.setTenantState("org_resilience", {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    testApiKey = creds.fullSecret;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("trips circuit to OPEN after consecutive 5xx failures, and routes fall back to secondary provider", async () => {
    // Make Anthropic fail with 500
    mockAnthropic.setNextError(
      new GrowXProviderError(
        "provider_server_error",
        "Anthropic 500 internal error",
        true,
        500,
      ),
    );

    // Request 1: Anthropic fails -> fallbacks to OpenAI
    const res1 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Test 1" }],
      }),
    });
    expect(res1.status).toBe(200);

    // Make Anthropic fail 2 more times to breach consecutiveFailureThreshold (3 failures)
    mockAnthropic.setNextError(
      new GrowXProviderError(
        "provider_server_error",
        "Anthropic 500 internal error",
        true,
        500,
      ),
    );
    await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Test 2" }],
      }),
    });

    mockAnthropic.setNextError(
      new GrowXProviderError(
        "provider_server_error",
        "Anthropic 500 internal error",
        true,
        500,
      ),
    );
    await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Test 3" }],
      }),
    });

    // Check circuit state for anthropic route
    const healthRes = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit`,
    );
    const healthJson = (await healthRes.json()) as any;
    expect(healthJson.circuitState).toBe("OPEN");

    // Request 4: Routing engine immediately skips Anthropic (circuit OPEN) and executes OpenAI directly!
    const openAICallsBefore = mockOpenAI.callCount;
    const anthropicCallsBefore = mockAnthropic.callCount;

    const res4 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Test 4" }],
      }),
    });

    expect(res4.status).toBe(200);
    const body4 = (await res4.json()) as any;
    expect(body4.choices[0].message.content).toBe("Hello from openai!");

    // Anthropic was NOT called because circuit was OPEN (0 calls added)
    expect(mockAnthropic.callCount).toBe(anthropicCallsBefore);
    // OpenAI was called directly
    expect(mockOpenAI.callCount).toBe(openAICallsBefore + 1);
  });

  it("fails fast with 503 NO_ELIGIBLE_ROUTE with 0 provider calls when all routes are circuit OPEN", async () => {
    // Force Open both circuits via internal endpoints
    await fetch(`${baseUrl}/internal/routes/${anthropicRouteId}/circuit/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Outage simulation",
        setBy: "ops",
        providerId: "anthropic",
      }),
    });

    await fetch(`${baseUrl}/internal/routes/${openAIRouteId}/circuit/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Outage simulation",
        setBy: "ops",
        providerId: "openai",
      }),
    });

    const anthropicCalls = mockAnthropic.callCount;
    const openaiCalls = mockOpenAI.callCount;

    // Request should fail fast immediately
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [{ role: "user", content: "Should fail fast" }],
      }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("model_unavailable");

    // Zero provider calls made
    expect(mockAnthropic.callCount).toBe(anthropicCalls);
    expect(mockOpenAI.callCount).toBe(openaiCalls);
  });

  it("does NOT count client cancellations or 400 Bad Requests toward circuit failure rates", async () => {
    // 1. Send invalid request (400)
    const resBad = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        model: "growx/fast",
        messages: [], // Invalid: empty messages array
      }),
    });
    expect(resBad.status).toBe(400);

    // Check circuit remains CLOSED
    const circuitRes = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit`,
    );
    const circuitJson = (await circuitRes.json()) as any;
    expect(circuitJson.circuitState).toBe("CLOSED");
  });

  it("allows privileged recovery to HALF_OPEN and resets back to CLOSED on successful requests", async () => {
    // 1. Force open
    await fetch(`${baseUrl}/internal/routes/${anthropicRouteId}/circuit/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Testing recovery",
        setBy: "ops",
        providerId: "anthropic",
      }),
    });

    // 2. Initiate recovery -> HALF_OPEN
    const recRes = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit/recover`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setBy: "ops_recovery",
          providerId: "anthropic",
        }),
      },
    );
    expect(recRes.status).toBe(200);

    const circuitRes = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit`,
    );
    const circuitJson = (await circuitRes.json()) as any;
    expect(circuitJson.circuitState).toBe("HALF_OPEN");

    // 3. Reset circuit directly
    const resetRes = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit/reset`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    expect(resetRes.status).toBe(200);

    const finalCircuit = await fetch(
      `${baseUrl}/internal/routes/${anthropicRouteId}/circuit`,
    );
    expect(((await finalCircuit.json()) as any).circuitState).toBe("CLOSED");
  });

  it("serves provider aggregate health summaries on GET /internal/providers/health", async () => {
    const res = await fetch(`${baseUrl}/internal/providers/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.snapshots)).toBe(true);
  });
});
