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
  TokenEstimator,
} from "@growx/rate-limits";
import {
  UsageMeteringService,
  InMemoryUsageLedgerRepository,
} from "@growx/metering";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { RoutingEngineRouteResolver } from "../../src/domain/route-resolver.js";
import { GatewayResilienceController } from "../../src/application/resilience-controller.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";
import { MockAdapter, TEST_ENCRYPTION_KEY, TEST_PEPPER } from "../helpers/test-fixture.js";
import { GrowXProviderError } from "@growx/contracts";

class MeteringTestMockAdapter extends MockAdapter {
  public callCount = 0;
  public alwaysFail = false;

  constructor(
    public override readonly providerId: string,
    private readonly defaultInputTokens = 20,
    private readonly defaultOutputTokens = 15
  ) {
    super();
  }

  override async execute(request: any, context: any): Promise<any> {
    this.callCount++;
    if (this.alwaysFail) {
      const err = new GrowXProviderError(
        "provider_server_error",
        `Simulated permanent route failure on ${this.providerId}`,
        true,
        500
      );
      (err as any).usage = {
        inputTokens: this.defaultInputTokens,
        outputTokens: 0,
        totalTokens: this.defaultInputTokens,
      };
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
        inputTokens: this.defaultInputTokens,
        outputTokens: this.defaultOutputTokens,
        totalTokens: this.defaultInputTokens + this.defaultOutputTokens,
        cachedInputTokens: 5,
        reasoningTokens: 0,
        source: "provider_reported",
      },
      timing: {
        startTime: now,
        endTime: new Date(now.getTime() + 40),
        latencyMs: 40,
        timeToFirstTokenMs: 15,
      },
    };
  }
}

describe("Phase 13 — Gateway Usage Metering & Authoritative Ledger End-to-End Tests", () => {
  let server: Server;
  let serverUrl: string;
  let rawApiKey: string;
  let rawApiKeyOrgB: string;
  let primaryAdapter: MeteringTestMockAdapter;
  let secondaryAdapter: MeteringTestMockAdapter;
  let usageLedgerRepo: InMemoryUsageLedgerRepository;
  let usageMetering: UsageMeteringService;

  const orgA = "org_meter_test_a";
  const wsA = "ws_meter_test_a";
  const orgB = "org_meter_test_b";
  const wsB = "ws_meter_test_b";

  beforeEach(async () => {
    // 1. Setup API Keys
    const apiKeyRepo = new InMemoryApiKeyRepository();
    const apiKeyEvents = new InMemoryLifecycleEvents();
    const apiKeyService = new ApiKeyService(
      apiKeyRepo,
      apiKeyEvents,
      { pepper: TEST_PEPPER }
    );

    const credsA = generateApiKeyCredentials("production");
    rawApiKey = credsA.fullSecret;
    await apiKeyRepo.insert({
      id: credsA.id,
      organizationId: orgA,
      workspaceId: wsA,
      environmentId: "env_prod",
      environment: "production",
      name: "Org A Metering Key",
      prefix: credsA.prefix,
      secretHash: hashApiKey(credsA.secretPart, TEST_PEPPER),
      status: "active",
      permissions: ["chat.completions.create", "models.read", "usage.read"],
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

    apiKeyRepo.setTenantState(orgA, {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    const credsB = generateApiKeyCredentials("production");
    rawApiKeyOrgB = credsB.fullSecret;
    await apiKeyRepo.insert({
      id: credsB.id,
      organizationId: orgB,
      workspaceId: wsB,
      environmentId: "env_prod",
      environment: "production",
      name: "Org B Metering Key",
      prefix: credsB.prefix,
      secretHash: hashApiKey(credsB.secretPart, TEST_PEPPER),
      status: "active",
      permissions: ["chat.completions.create", "models.read", "usage.read"],
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

    apiKeyRepo.setTenantState(orgB, {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    // 2. Setup Model Registry
    const modelRegistryRepo = new InMemoryModelRegistryRepository();
    const modelRegistryEvents = new InMemoryModelRegistryEvents();
    const modelRegistry = new ModelRegistryService(modelRegistryRepo, modelRegistryEvents);

    const canonicalModel = await modelRegistry.createModel({
      canonicalId: "meter-gpt-4o",
      displayName: "Meter GPT-4o",
      family: "gpt",
      category: "chat",
      inputModalities: ["text"],
      outputModalities: ["text"],
      capabilities: ["text.generate", "streaming"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      status: "active",
    }, "usr_admin");

    // 3. Setup Adapters & Provider Service
    primaryAdapter = new MeteringTestMockAdapter("openai", 30, 20);
    secondaryAdapter = new MeteringTestMockAdapter("anthropic", 25, 15);

    const adapterRegistry = new AdapterRegistry();
    adapterRegistry.register(primaryAdapter);
    adapterRegistry.register(secondaryAdapter);

    const providerCrypto = new ProviderCredentialCrypto(TEST_ENCRYPTION_KEY);
    const providerRepo = new InMemoryProviderRepository();
    const providerEvents = new InMemoryProviderEvents();
    const providerService = new ProviderService(
      providerRepo,
      providerEvents,
      providerCrypto,
      adapterRegistry
    );

    const openAIProvider = await providerService.createProvider({
      code: "openai",
      displayName: "OpenAI",
      adapterType: "openai",
      baseUrl: "https://api.openai.com",
      status: "active",
      enabled: true,
      priority: 1,
    }, "usr_admin");

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

    const anthropicProvider = await providerService.createProvider({
      code: "anthropic",
      displayName: "Anthropic",
      adapterType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      status: "active",
      enabled: true,
      priority: 2,
    }, "usr_admin");

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

    await modelRegistry.addProviderRoute({
      modelId: canonicalModel.id,
      providerId: openAIProvider.id,
      providerModelId: "gpt-4o-2024-08-06",
      region: "global",
      priority: 1,
      routingEligible: true,
      status: "active",
    }, "usr_admin");

    await modelRegistry.addProviderRoute({
      modelId: canonicalModel.id,
      providerId: anthropicProvider.id,
      providerModelId: "claude-3-5-sonnet",
      region: "global",
      priority: 2,
      routingEligible: true,
      status: "active",
    }, "usr_admin");

    // 4. Setup Routing Service
    const routingRepo = new InMemoryRoutingRepository();
    const routingEvents = new InMemoryRoutingEvents();
    const healthStore = new InMemoryRouteHealthStore();
    const routingEngine = new RoutingEngine(modelRegistry, providerService, routingRepo, routingEvents, {
      routeHealthStore: healthStore,
    });
    const routeResolver = new RoutingEngineRouteResolver(routingEngine);

    // 5. Setup Rate Limiting, Capacity & Quota
    const counterStore = new InMemoryCounterStore();
    const quotaPolicyRepo = new InMemoryQuotaPolicyRepository();
    const quotaEngine = new QuotaEngine(counterStore, quotaPolicyRepo);
    const tokenEstimator = new TokenEstimator();

    // 6. Setup Phase 13 Usage Metering & Authoritative Ledger
    usageLedgerRepo = new InMemoryUsageLedgerRepository();
    usageMetering = new UsageMeteringService({
      repository: usageLedgerRepo,
      tokenEstimator,
    });

    // 7. Setup Gateway Infrastructure
    const gatewayRepo = new InMemoryGatewayRepository();
    const gatewayEvents = new InMemoryGatewayEvents();

    const resilienceController = new GatewayResilienceController(
      modelRegistry,
      providerService,
      gatewayRepo,
      gatewayEvents,
      {
        routeHealthStore: healthStore,
        quotaEngine,
        tokenEstimator,
        usageMetering,
        retryPolicy: { maxAttempts: 3 },
      }
    );

    const gatewayEngine = new GatewayEngine(
      modelRegistry,
      providerService,
      gatewayRepo,
      gatewayEvents,
      routeResolver,
      undefined,
      resilienceController,
      quotaEngine,
      tokenEstimator,
      undefined,
      usageMetering
    );

    // 8. Start HTTP Server
    const app = createGatewayServer({
      apiKeyService,
      modelRegistry,
      gatewayEngine,
      });

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve(undefined);
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve(undefined));
      });
    }
  });

  it("1. meters a successful request into request, attempt, and immutable usage events", async () => {
    const res = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        model: "meter-gpt-4o",
        messages: [{ role: "user", content: "Hello world" }],
      }),
    });

    expect(res.status).toBe(200);
    const reqId = res.headers.get("x-growx-request-id") || res.headers.get("x-request-id");
    expect(reqId).toBeDefined();

    // 1. Verify Gateway Request Record in Metering Store
    const reqRecord = await usageLedgerRepo.getRequestRecord(reqId!);
    expect(reqRecord).toBeDefined();
    expect(reqRecord?.organizationId).toBe(orgA);
    expect(reqRecord?.workspaceId).toBe(wsA);
    expect(reqRecord?.status).toBe("completed");
    expect(reqRecord?.meteringQuality).toBe("provider_reported");
    expect(reqRecord?.logicalUsage.inputTokens).toBe(30);
    expect(reqRecord?.logicalUsage.outputTokens).toBe(20);
    expect(reqRecord?.logicalUsage.totalTokens).toBe(50);
    expect(reqRecord?.providerConsumption.inputTokens).toBe(30);
    expect(reqRecord?.providerConsumption.outputTokens).toBe(20);
    expect(reqRecord?.providerConsumption.totalTokens).toBe(50);
    expect(reqRecord?.attemptCount).toBe(1);
    expect(reqRecord?.retryCount).toBe(0);
    expect(reqRecord?.fallbackCount).toBe(0);

    // 2. Verify Gateway Attempt Record
    const attempts = await usageLedgerRepo.listAttemptsForRequest(reqId!);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("completed");
    expect(attempts[0]?.usage?.inputTokens).toBe(30);
    expect(attempts[0]?.usage?.outputTokens).toBe(20);

    // 3. Verify Immutable Usage Events
    const events = await usageLedgerRepo.listUsageEventsForRequest(reqId!);
    expect(events.length).toBeGreaterThanOrEqual(2);
    const inputEvent = events.find((e) => e.usageType === "input_tokens");
    const outputEvent = events.find((e) => e.usageType === "output_tokens");
    expect(inputEvent?.quantity).toBe(30n);
    expect(outputEvent?.quantity).toBe(20n);

    // 4. Verify Customer Read Endpoint GET /v1/usage/requests/:id
    const custRes = await fetch(`${serverUrl}/v1/usage/requests/${reqId}`, {
      headers: { authorization: `Bearer ${rawApiKey}` },
    });
    expect(custRes.status).toBe(200);
    const custData = await custRes.json();
    expect(custData.request_id).toBe(reqId);
    expect(custData.logical_usage.totalTokens).toBe(50);
    expect(custData.metering_quality).toBe("provider_reported");

    // 5. Verify Internal Read Endpoint GET /internal/usage/requests/:id
    const intRes = await fetch(`${serverUrl}/internal/usage/requests/${reqId}`);
    expect(intRes.status).toBe(200);
    const intData = await intRes.json();
    expect(intData.request.requestId).toBe(reqId);
    expect(intData.attempts).toHaveLength(1);
    expect(intData.events.length).toBeGreaterThanOrEqual(2);
  });

  it("2. measures separate provider consumption from logical usage during fallback", async () => {
    // Make primary adapter fail always so it falls back to Anthropic
    primaryAdapter.alwaysFail = true;

    const res = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        model: "meter-gpt-4o",
        messages: [{ role: "user", content: "Test fallback metering" }],
      }),
    });

    expect(res.status).toBe(200);
    const reqId = (res.headers.get("x-growx-request-id") || res.headers.get("x-request-id"))!;

    const reqRecord = await usageLedgerRepo.getRequestRecord(reqId);
    expect(reqRecord).toBeDefined();
    expect(reqRecord?.status).toBe("completed");
    expect(reqRecord?.attemptCount).toBeGreaterThanOrEqual(2);
    expect(reqRecord?.fallbackCount).toBe(1);
    expect(reqRecord?.retryCount).toBe(1);

    // Logical usage is customer-visible (from secondary adapter: 25 input, 15 output = 40 total)
    expect(reqRecord?.logicalUsage.inputTokens).toBe(25);
    expect(reqRecord?.logicalUsage.outputTokens).toBe(15);
    expect(reqRecord?.logicalUsage.totalTokens).toBe(40);

    // Provider consumption includes both primary attempt (30 input) + secondary attempt (25 input, 15 output)
    expect(reqRecord?.providerConsumption.inputTokens).toBe(85); // 30 + 30 + 25
    expect(reqRecord?.providerConsumption.outputTokens).toBe(15); // 0 + 15
    expect(reqRecord?.providerConsumption.totalTokens).toBe(100);

    // Check attempt history
    const attempts = await usageLedgerRepo.listAttemptsForRequest(reqId);
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0]?.status).toBe("failed");
    expect(attempts[attempts.length - 1]?.status).toBe("completed");
  });

  it("3. produces 0 provider attempts and 0 provider consumption when rejected by quota or policy", async () => {
    const res = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        model: "non-existent-model",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    expect(res.status).toBe(404);
    const reqId = (res.headers.get("x-growx-request-id") || res.headers.get("x-request-id"))!;
    expect(reqId).toBeDefined();

    const reqRecord = await usageLedgerRepo.getRequestRecord(reqId);
    expect(reqRecord?.status).toBe("failed");
    expect(reqRecord?.attemptCount).toBe(0);
    expect(reqRecord?.logicalUsage.totalTokens).toBe(0);
    expect(reqRecord?.providerConsumption.totalTokens).toBe(0);

    const attempts = await usageLedgerRepo.listAttemptsForRequest(reqId);
    expect(attempts).toHaveLength(0);
  });

  it("4. enforces strict tenant isolation on customer usage queries", async () => {
    // Send request under Org A
    const resA = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        model: "meter-gpt-4o",
        messages: [{ role: "user", content: "Org A request" }],
      }),
    });
    expect(resA.status).toBe(200);
    const reqIdA = (resA.headers.get("x-growx-request-id") || resA.headers.get("x-request-id"))!;

    // Attempt to access Org A request usage with Org B API key -> must 404
    const resB = await fetch(`${serverUrl}/v1/usage/requests/${reqIdA}`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgB}` },
    });
    expect(resB.status).toBe(404);

    // Query aggregated usage with Org B key -> data array must not contain Org A tokens
    const aggResB = await fetch(`${serverUrl}/v1/usage`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgB}` },
    });
    expect(aggResB.status).toBe(200);
    const aggDataB = await aggResB.json();
    expect(aggDataB.data).toHaveLength(0);
  });

  it("5. supports privileged adjustment and rebuilds aggregated views from the immutable ledger", async () => {
    // 1. Perform request
    const res = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        model: "meter-gpt-4o",
        messages: [{ role: "user", content: "Reconciliation test" }],
      }),
    });
    expect(res.status).toBe(200);
    const reqId = (res.headers.get("x-growx-request-id") || res.headers.get("x-request-id"))!;

    // 2. Perform manual correction via POST /internal/usage/correct
    const correctRes = await fetch(`${serverUrl}/internal/usage/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: reqId,
        usageType: "input_tokens",
        differenceQuantity: -5,
        previousQuantity: 30,
        newQuantity: 25,
        reason: "Provider audit confirmed 5 cached tokens were unbilled",
        operatorId: "sec.ops.admin@growx.ai",
      }),
    });
    expect(correctRes.status).toBe(201);
    const corrData = await correctRes.json();
    expect(corrData.reason).toBe("Provider audit confirmed 5 cached tokens were unbilled");

    // 3. Verify Aggregates Rebuild POST /internal/usage/aggregates/rebuild
    const rebuildRes = await fetch(`${serverUrl}/internal/usage/aggregates/rebuild`, {
      method: "POST",
    });
    expect(rebuildRes.status).toBe(200);
    const rebuildData = await rebuildRes.json();
    expect(rebuildData.aggregateCount).toBeGreaterThan(0);
  });
});
