import {
  type CanonicalCapability,
  type MachineAuthContext,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
  type NormalizedStreamEvent,
  type ProviderExecutionContext,
} from "@growx/contracts";
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
import { AdapterRegistry, type ProviderAdapter } from "@growx/provider-sdk";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";

export const TEST_PEPPER = "growx-secret-pepper-32-bytes-long-string!!";
export const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export class MockAdapter implements ProviderAdapter {
  readonly providerId: string = "mock-openai";
  public calls: NormalizedGenerationRequest[] = [];
  public streamCalls: NormalizedGenerationRequest[] = [];
  public executeMock?: (
    req: NormalizedGenerationRequest,
    ctx: ProviderExecutionContext,
  ) => Promise<NormalizedGenerationResponse>;
  public streamMock?: (
    req: NormalizedGenerationRequest,
    ctx: ProviderExecutionContext,
  ) => AsyncIterable<NormalizedStreamEvent>;

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  async healthProbe(context?: any): Promise<any> {
    return {
      state: "healthy",
      latencyMs: 5,
      checkedAt: new Date().toISOString(),
    };
  }

  async health(options?: any): Promise<any> {
    return {
      state: "healthy",
      latencyMs: 5,
      checkedAt: new Date().toISOString(),
    };
  }

  supports(capability: CanonicalCapability): boolean {
    return true;
  }

  normalizeError(error: unknown) {
    return error as any;
  }

  extractUsage(raw: unknown) {
    return {
      inputTokens: 10,
      outputTokens: 15,
      totalTokens: 25,
      source: "provider_reported" as const,
    };
  }

  async execute(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<NormalizedGenerationResponse> {
    this.calls.push(request);
    if (this.executeMock) {
      return this.executeMock(request, context);
    }

    const now = new Date();
    return {
      requestId: request.requestId,
      canonicalModelId: request.canonicalModelId,
      providerId: context.providerId,
      providerModelId: request.providerModelId,
      providerRequestId: `mock_req_${Date.now()}`,
      output: [
        {
          role: "assistant",
          content: "Hello from GrowX AI Gateway mock provider!",
        },
      ],
      finishReason: "stop",
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        cachedInputTokens: 2,
        reasoningTokens: 0,
        source: "provider_reported",
      },
      timing: {
        startedAt: now,
        completedAt: new Date(now.getTime() + 15),
        latencyMs: 15,
      },
    };
  }

  async *stream(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext,
  ): AsyncIterable<NormalizedStreamEvent> {
    this.streamCalls.push(request);
    if (this.streamMock) {
      yield* this.streamMock(request, context);
      return;
    }

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
      delta: "Hello from stream!",
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
        output: [{ role: "assistant", content: "Hello from stream!" }],
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
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

  async generate(req: any, ctx: any): Promise<any> {
    return {
      output: "Mock legacy output",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  async embed(req: any, ctx: any): Promise<any> {
    return {
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
    };
  }
}

export interface TestGatewayFixture {
  apiKeyRepo: InMemoryApiKeyRepository;
  apiKeyService: ApiKeyService;
  modelRepo: InMemoryModelRegistryRepository;
  modelService: ModelRegistryService;
  providerRepo: InMemoryProviderRepository;
  providerService: ProviderService;
  mockAdapter: MockAdapter;
  gatewayRepo: InMemoryGatewayRepository;
  gatewayEvents: InMemoryGatewayEvents;
  gatewayEngine: GatewayEngine;
  server: ReturnType<typeof createGatewayServer>;
  createTestApiKey(overrides?: {
    organizationId?: string;
    workspaceId?: string;
    environmentId?: string;
    environment?: "development" | "production" | "staging";
    status?: "active" | "revoked" | "expired" | "disabled";
    permissions?: Array<
      "chat.completions.create" | "responses.create" | "models.read"
    >;
    modelRules?: Array<{ effect: "allow" | "deny"; pattern: string }>;
  }): Promise<{
    secret: string;
    key: string;
    rawKey: string;
    keyId: string;
    record: any;
  }>;
}

export async function createTestGatewayFixture(): Promise<TestGatewayFixture> {
  const apiKeyRepo = new InMemoryApiKeyRepository();
  const apiKeyEvents = new InMemoryLifecycleEvents();
  const apiKeyService = new ApiKeyService(apiKeyRepo, apiKeyEvents, {
    pepper: TEST_PEPPER,
  });

  const modelRepo = new InMemoryModelRegistryRepository();
  const modelEvents = new InMemoryModelRegistryEvents();
  const modelService = new ModelRegistryService(modelRepo, modelEvents);

  const providerRepo = new InMemoryProviderRepository();
  const providerEvents = new InMemoryProviderEvents();
  const crypto = new ProviderCredentialCrypto(TEST_ENCRYPTION_KEY);
  const adapterRegistry = new AdapterRegistry();

  const mockAdapter = new MockAdapter();
  adapterRegistry.register(mockAdapter);

  const providerService = new ProviderService(
    providerRepo,
    providerEvents,
    crypto,
    adapterRegistry,
  );

  const gatewayRepo = new InMemoryGatewayRepository();
  const gatewayEvents = new InMemoryGatewayEvents();
  const gatewayEngine = new GatewayEngine(
    modelService,
    providerService,
    gatewayRepo,
    gatewayEvents,
  );

  const server = createGatewayServer({
    apiKeyService,
    modelRegistry: modelService,
    gatewayEngine,
  });

  // Seed default Provider
  const provider = await providerService.createProvider(
    {
      code: "mock-openai",
      displayName: "Mock OpenAI Provider",
      adapterType: "mock-openai",
      baseUrl: "https://api.openai.mock",
      priority: 100,
      enabled: true,
      status: "active",
    },
    "usr_operator",
  );

  // Seed default Credential
  const credential = await providerService.createCredential(
    provider.id,
    {
      name: "Mock Primary Credential",
      environment: "production",
      rawSecret: "sk-mock-key-1234567890",
      encryptionKeyVersion: "v1",
    },
    "usr_operator",
  );

  // Seed default Canonical Model (gpt-4o-mini)
  const canonicalModel = await modelService.createModel(
    {
      canonicalId: "openai/gpt-4o-mini",
      displayName: "GPT-4o mini",
      family: "gpt",
      category: "chat",
      status: "active",
      customerVisible: true,
      routingEligible: true,
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsStreaming: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: true,
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      capabilities: [
        "text.generate",
        "streaming",
        "tools.call",
        "structured_output",
        "vision.input",
        "text.reason",
      ],
    },
    "usr_operator",
  );

  // Seed Provider Route for gpt-4o-mini
  await modelService.addProviderRoute(
    {
      modelId: canonicalModel.id,
      providerId: provider.id,
      providerModelId: "gpt-4o-mini",
      region: "global",
      status: "active",
      routingEligible: true,
      priority: 100,
    },
    "usr_operator",
  );

  // Seed Model Alias: growx/fast -> openai/gpt-4o-mini
  await modelService.createAlias(
    {
      alias: "growx/fast",
      canonicalModelId: canonicalModel.canonicalId,
      type: "product",
      description: "Default fast model",
    },
    "usr_operator",
  );

  // Helper to create API keys
  const createTestApiKey = async (overrides = {}) => {
    const orgId = (overrides as any).organizationId ?? "org_test123";
    const wsId = (overrides as any).workspaceId ?? "ws_test123";
    const envId = (overrides as any).environmentId ?? "env_test123";
    const envType = (overrides as any).environment ?? "development";
    const status = (overrides as any).status ?? "active";
    const permissions = (overrides as any).permissions ?? [
      "chat.completions.create",
      "responses.create",
      "models.read",
    ];
    const modelRules = (overrides as any).modelRules ?? [];

    const creds = generateApiKeyCredentials(
      envType === "production" ? "production" : "development",
    );
    const secretHash = hashApiKey(creds.secretPart, TEST_PEPPER);

    const record = {
      id: creds.id,
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: envType,
      name: "Test API Key",
      prefix: creds.prefix,
      secretHash,
      status,
      permissions,
      modelRules,
      ipAllowlist: [],
      rateLimits: [],
      createdBy: "usr_test",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: (overrides as any).expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    };

    await apiKeyRepo.insert(record as any);
    apiKeyRepo.setTenantState(orgId, {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    return {
      secret: creds.secretPart,
      key: creds.fullSecret,
      rawKey: creds.fullSecret,
      keyId: creds.id,
      record,
    };
  };

  return {
    apiKeyRepo,
    apiKeyService,
    modelRepo,
    modelService,
    providerRepo,
    providerService,
    mockAdapter,
    gatewayRepo,
    gatewayEvents,
    gatewayEngine,
    server,
    createTestApiKey,
  };
}
