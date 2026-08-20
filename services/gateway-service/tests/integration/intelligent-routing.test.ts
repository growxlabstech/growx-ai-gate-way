import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryApiKeyRepository,
  InMemoryLifecycleEvents,
  ApiKeyService,
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
  InMemoryLatencySignalStore,
  InMemoryAvailabilitySignalStore,
  RoutingEngine,
} from "@growx/routing-service";
import { AdapterRegistry } from "@growx/provider-sdk";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { RoutingEngineRouteResolver } from "../../src/domain/route-resolver.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";
import { MockAdapter, TEST_ENCRYPTION_KEY, TEST_PEPPER } from "../helpers/test-fixture.js";
import type { Server } from "node:http";

class MultiProviderMockAdapter extends MockAdapter {
  public callCount = 0;
  public lastRequestedModel?: string;

  constructor(public override readonly providerId: string) {
    super();
  }

  override async execute(request: any, context: any): Promise<any> {
    this.callCount++;
    this.lastRequestedModel = request.providerModelId;

    const now = new Date();
    return {
      requestId: request.requestId,
      canonicalModelId: request.canonicalModelId,
      providerId: context.providerId,
      providerModelId: request.providerModelId,
      providerRequestId: `mock_req_${this.providerId}_${Date.now()}`,
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
        cachedInputTokens: 0,
        reasoningTokens: 0,
        source: "provider_reported",
      },
      timing: {
        startedAt: now,
        completedAt: new Date(now.getTime() + 20),
        latencyMs: 20,
      },
    };
  }

  override async *stream(request: any, context: any): AsyncIterable<any> {
    this.callCount++;
    this.lastRequestedModel = request.providerModelId;

    const now = new Date().toISOString();
    yield {
      requestId: request.requestId,
      responseId: `resp_${request.requestId}`,
      sequence: 0,
      type: "response.started",
      timestamp: now,
    };

    yield {
      requestId: request.requestId,
      responseId: `resp_${request.requestId}`,
      sequence: 1,
      type: "output_text.delta",
      delta: `Hello from ${this.providerId} stream!`,
      timestamp: now,
    };

    yield {
      requestId: request.requestId,
      responseId: `resp_${request.requestId}`,
      sequence: 2,
      type: "response.completed",
      finishReason: "stop",
      timestamp: now,
      response: {
        requestId: request.requestId,
        canonicalModelId: request.canonicalModelId,
        providerId: context.providerId,
        providerModelId: request.providerModelId,
        output: [{ role: "assistant", content: `Hello from ${this.providerId} stream!` }],
        finishReason: "stop",
        usage: {
          inputTokens: 15,
          outputTokens: 8,
          totalTokens: 23,
          source: "provider_reported",
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          latencyMs: 20,
        },
      },
    };
  }
}

describe("Intelligent Routing Engine End-to-End Tests", () => {
  let apiKeyRepo: InMemoryApiKeyRepository;
  let apiKeyService: ApiKeyService;
  let modelRepo: InMemoryModelRegistryRepository;
  let modelService: ModelRegistryService;
  let providerRepo: InMemoryProviderRepository;
  let providerEvents: InMemoryProviderEvents;
  let providerService: ProviderService;
  let routingRepo: InMemoryRoutingRepository;
  let routingEvents: InMemoryRoutingEvents;
  let latencyStore: InMemoryLatencySignalStore;
  let availabilityStore: InMemoryAvailabilitySignalStore;
  let routingEngine: RoutingEngine;
  let gatewayRepo: InMemoryGatewayRepository;
  let gatewayEvents: InMemoryGatewayEvents;
  let gatewayEngine: GatewayEngine;
  let server: Server;
  let baseUrl: string;

  let mockOpenAI: MultiProviderMockAdapter;
  let mockAnthropic: MultiProviderMockAdapter;

  let testApiKey: string;
  let openAIRouteId: string;
  let anthropicRouteId: string;
  let openAIProviderId: string;
  let anthropicProviderId: string;

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

    mockOpenAI = new MultiProviderMockAdapter("openai");
    mockAnthropic = new MultiProviderMockAdapter("anthropic");
    adapterRegistry.register(mockOpenAI);
    adapterRegistry.register(mockAnthropic);

    providerService = new ProviderService(
      providerRepo,
      providerEvents,
      crypto,
      adapterRegistry
    );

    // 4. Routing Engine & Resolver
    routingRepo = new InMemoryRoutingRepository();
    routingEvents = new InMemoryRoutingEvents();
    latencyStore = new InMemoryLatencySignalStore();
    availabilityStore = new InMemoryAvailabilitySignalStore();

    routingEngine = new RoutingEngine(
      modelService,
      providerService,
      routingRepo,
      routingEvents,
      {
        latencySignalProvider: latencyStore,
        availabilitySignalProvider: availabilityStore,
      }
    );
    const routeResolver = new RoutingEngineRouteResolver(routingEngine);

    // 5. Gateway Engine
    gatewayRepo = new InMemoryGatewayRepository();
    gatewayEvents = new InMemoryGatewayEvents();
    gatewayEngine = new GatewayEngine(
      modelService,
      providerService,
      gatewayRepo,
      gatewayEvents,
      routeResolver
    );

    // 6. HTTP Server
    server = createGatewayServer({
      apiKeyService,
      modelRegistry: modelService,
      gatewayEngine,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const addr = server.address() as any;
    baseUrl = `http://localhost:${addr.port}`;

    // 7. Seed Providers
    const provOpenAI = await providerService.createProvider(
      {
        code: "openai",
        displayName: "OpenAI",
        adapterType: "openai",
        baseUrl: "https://api.openai.com/v1",
        region: "us-east",
        priority: 100,
        enabled: true,
        status: "active",
      },
      "usr_admin"
    );
    openAIProviderId = provOpenAI.id;

    const provAnthropic = await providerService.createProvider(
      {
        code: "anthropic",
        displayName: "Anthropic",
        adapterType: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        region: "eu-west",
        priority: 100,
        enabled: true,
        status: "active",
      },
      "usr_admin"
    );
    anthropicProviderId = provAnthropic.id;

    // Seed Credentials
    await providerService.createCredential(
      provOpenAI.id,
      { name: "default", environment: "production", rawSecret: "sk-openai" },
      "usr_admin"
    );
    await providerService.createCredential(
      provAnthropic.id,
      { name: "default", environment: "production", rawSecret: "sk-anthropic" },
      "usr_admin"
    );

    // 8. Seed Model: growx/smart with 2 routes
    const smartModel = await modelService.createModel(
      {
        canonicalId: "growx/smart",
        displayName: "GrowX Smart Multi-Provider",
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
      "usr_admin"
    );

    // Route 1: OpenAI (priority 20)
    const r1 = await modelService.addProviderRoute(
      {
        modelId: smartModel.id,
        providerId: provOpenAI.id,
        providerModelId: "gpt-4o",
        region: "us-east",
        status: "active",
        routingEligible: true,
        priority: 20,
      },
      "usr_admin"
    );
    openAIRouteId = r1.id;

    // Route 2: Anthropic (priority 10 - higher priority by default)
    const r2 = await modelService.addProviderRoute(
      {
        modelId: smartModel.id,
        providerId: provAnthropic.id,
        providerModelId: "claude-3-5-sonnet",
        region: "eu-west",
        status: "active",
        routingEligible: true,
        priority: 10,
      },
      "usr_admin"
    );
    anthropicRouteId = r2.id;

    // Add Pricing: OpenAI ($2.50 in, $10 out), Anthropic ($3.00 in, $15 out)
    await modelService.addPricing(
      {
        routeId: r1.id,
        inputPricePerMillionMinor: 250,
        outputPricePerMillionMinor: 1000,
        currency: "USD",
        source: "manual",
      },
      "usr_admin"
    );
    await modelService.addPricing(
      {
        routeId: r2.id,
        inputPricePerMillionMinor: 300,
        outputPricePerMillionMinor: 1500,
        currency: "USD",
        source: "manual",
      },
      "usr_admin"
    );

    // 9. Create API Key for workspace ws_1
    const { secret } = await apiKeyService.create({
      name: "Test Intelligent Key",
      organizationId: "org_1",
      workspaceId: "ws_1",
      environmentId: "env_1",
      environment: "production",
      permissions: ["chat.completions.create"],
      createdBy: "usr_test",
    });
    testApiKey = secret;
  });

  it("routes to highest priority candidate (Anthropic priority 10 < 20) by default", async () => {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Hello!" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from anthropic!");
    expect(mockAnthropic.callCount).toBe(1);
    expect(mockOpenAI.callCount).toBe(0);

    // Verify RoutingDecision was persisted
    const decisions = await routingRepo.listDecisions();
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.selectedProviderId).toBe(anthropicProviderId);
    expect(decisions[0]!.strategy).toBe("priority");
    expect(decisions[0]!.eligibleCandidateCount).toBe(2);
  });

  it("routes to lowest cost candidate (OpenAI $2.50 < Anthropic $3.00) when strategy is lowest_cost", async () => {
    // Configure workspace policy for lowest_cost
    await routingRepo.savePolicy({
      id: "pol_ws_cost",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Cost Optimized Policy",
      strategy: "lowest_cost",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Calculate something for me" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from openai!");
    expect(mockOpenAI.callCount).toBe(1);
    expect(mockAnthropic.callCount).toBe(0);
  });

  it("routes to lowest latency candidate based on real latency telemetry signals", async () => {
    // Configure workspace policy for lowest_latency
    await routingRepo.savePolicy({
      id: "pol_ws_lat",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Latency Optimized Policy",
      strategy: "lowest_latency",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Record latency signals: OpenAI is 15ms, Anthropic is 140ms
    latencyStore.recordLatency(openAIProviderId, "gpt-4o", 15);
    latencyStore.recordLatency(anthropicProviderId, "claude-3-5-sonnet", 140);

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Fast reply needed" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from openai!");
    expect(mockOpenAI.callCount).toBe(1);
    expect(mockAnthropic.callCount).toBe(0);
  });

  it("enforces tenant provider denial and routes to alternate eligible candidate", async () => {
    // Anthropic is highest priority, but org denies Anthropic
    await routingRepo.savePolicy({
      id: "pol_org_deny",
      organizationId: "org_1",
      workspaceId: null,
      name: "Deny Anthropic Org Policy",
      strategy: "priority",
      deniedProviders: [anthropicProviderId],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Hello!" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from openai!");
    expect(mockOpenAI.callCount).toBe(1);
    expect(mockAnthropic.callCount).toBe(0);
  });

  it("enforces data residency / regional constraint", async () => {
    // Restrict workspace policy to eu-west only
    await routingRepo.savePolicy({
      id: "pol_ws_eu",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "EU Data Residency Policy",
      strategy: "priority",
      allowedRegions: ["eu-west"],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "EU GDPR request" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from anthropic!"); // Anthropic is eu-west, OpenAI is us-east
    expect(mockAnthropic.callCount).toBe(1);
    expect(mockOpenAI.callCount).toBe(0);
  });

  it("routes streaming requests using the identical routing engine", async () => {
    // Configure workspace policy for lowest_cost
    await routingRepo.savePolicy({
      id: "pol_ws_cost_stream",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Cost Policy for Streaming",
      strategy: "lowest_cost",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Stream this" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain("openai stream!");
    expect(mockOpenAI.callCount).toBe(1);
    expect(mockAnthropic.callCount).toBe(0);

    // Verify RoutingDecision was recorded with stream: true
    const decisions = await routingRepo.listDecisions();
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.selectedProviderId).toBe(openAIProviderId);
  });

  it("executes exactly 1 provider attempt per gateway execution (no multi-provider retry in Phase 8)", async () => {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Single attempt check" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockAnthropic.callCount).toBe(1);
    expect(mockOpenAI.callCount).toBe(0);
  });

  it("returns 503 NO_ELIGIBLE_ROUTE when no provider routes meet eligibility criteria", async () => {
    // Deny both providers
    await routingRepo.savePolicy({
      id: "pol_deny_all",
      organizationId: "org_1",
      workspaceId: "ws_1",
      name: "Deny All",
      strategy: "priority",
      deniedProviders: [openAIProviderId, anthropicProviderId],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "growx/smart",
        messages: [{ role: "user", content: "Should fail" }],
      }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("model_unavailable");
  });
});
