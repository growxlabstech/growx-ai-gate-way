import { describe, expect, it } from "vitest";
import {
  GrowXProviderError,
  type NormalizedStreamEvent,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";
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
import { AdapterRegistry, type ProviderAdapter } from "@growx/provider-sdk";
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
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import { GatewayResilienceController } from "../../src/application/resilience-controller.js";
import { StreamRegistry } from "../../src/application/shutdown.js";
import { RoutingEngineRouteResolver } from "../../src/domain/route-resolver.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import { createGatewayServer } from "../../src/transport/http-server.js";

class ControllableMockAdapter implements ProviderAdapter {
  public callCount = 0;
  constructor(public readonly providerId: string = "mock") {}

  public behavior?: (req: any, ctx: any) => Promise<any>;
  public streamBehavior?: (req: any, ctx: any) => AsyncIterable<NormalizedStreamEvent>;

  async validateConfiguration(): Promise<boolean> {
    return true;
  }

  async healthProbe(context?: any): Promise<any> {
    return { state: "healthy", latencyMs: 5, checkedAt: new Date().toISOString() };
  }

  async health(options?: any): Promise<any> {
    return { state: "healthy", latencyMs: 5, checkedAt: new Date().toISOString() };
  }

  supports(capability: any): boolean {
    return true;
  }

  normalizeError(error: unknown): any {
    return error;
  }

  extractUsage(raw: unknown): any {
    return { inputTokens: 10, outputTokens: 15, totalTokens: 25, source: "provider_reported" as const };
  }

  async execute(request: any, context: any): Promise<any> {
    this.callCount++;
    if (this.behavior) {
      return this.behavior(request, context);
    }
    const now = new Date();
    return {
      requestId: request.requestId,
      canonicalModelId: request.canonicalModelId,
      providerId: context.providerId ?? this.providerId,
      providerModelId: request.providerModelId,
      providerRequestId: `mock_req_${Date.now()}`,
      output: [{ role: "assistant", content: "Mock response" }],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
      timing: { startedAt: now, completedAt: new Date(now.getTime() + 15), latencyMs: 15 },
    };
  }

  async *stream(request: any, context: any): AsyncIterable<NormalizedStreamEvent> {
    this.callCount++;
    if (this.streamBehavior) {
      yield* this.streamBehavior(request, context);
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
      delta: "Mock streaming text",
      timestamp: now,
    };
    yield {
      requestId: request.requestId,
      responseId: `resp_${request.requestId}`,
      sequence: 2,
      type: "response.completed",
      timestamp: now,
      response: {
        requestId: request.requestId,
        canonicalModelId: request.canonicalModelId,
        providerId: context.providerId ?? this.providerId,
        providerModelId: request.providerModelId,
        providerRequestId: `mock_req_${Date.now()}`,
        finishReason: "stop",
        output: [{ role: "assistant", content: "Mock streaming text" }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
        timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 15 },
      },
    };
  }
}

async function setupResilienceTestFixture() {
  const pepper = "test-secret-pepper-32-chars-long!";
  const keyRepo = new InMemoryApiKeyRepository();
  const keyEvents = new InMemoryLifecycleEvents();
  const apiKeyService = new ApiKeyService(keyRepo, keyEvents, { pepper });

  const modelRepo = new InMemoryModelRegistryRepository();
  const modelEvents = new InMemoryModelRegistryEvents();
  const modelRegistry = new ModelRegistryService(modelRepo, modelEvents);

  const provRepo = new InMemoryProviderRepository();
  const provEvents = new InMemoryProviderEvents();
  const crypto = new ProviderCredentialCrypto("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  const adapterRegistry = new AdapterRegistry();

  const mockOpenAI = new ControllableMockAdapter("openai");
  const mockAnthropic = new ControllableMockAdapter("anthropic");

  adapterRegistry.register(mockOpenAI);
  adapterRegistry.register(mockAnthropic);

  const providerService = new ProviderService(provRepo, provEvents, crypto, adapterRegistry);

  const routingRepo = new InMemoryRoutingRepository();
  const routingEvents = new InMemoryRoutingEvents();
  const routingEngine = new RoutingEngine(modelRegistry, providerService, routingRepo, routingEvents);
  const routeResolver = new RoutingEngineRouteResolver(routingEngine);

  const gatewayRepo = new InMemoryGatewayRepository();
  const gatewayEvents = new InMemoryGatewayEvents();
  const streamRegistry = new StreamRegistry();

  const resilienceController = new GatewayResilienceController(
    modelRegistry,
    providerService,
    gatewayRepo,
    gatewayEvents,
    {
      retryPolicy: {
        maxAttempts: 3,
        maxSameRouteRetries: 1,
        maxFallbackRoutes: 2,
        baseBackoffMs: 10,
        maxBackoffMs: 50,
        jitter: "none",
        minimumRemainingDeadlineMs: 100,
      },
    }
  );

  const gatewayEngine = new GatewayEngine(
    modelRegistry,
    providerService,
    gatewayRepo,
    gatewayEvents,
    routeResolver,
    streamRegistry,
    resilienceController
  );

  const server = createGatewayServer({
    apiKeyService,
    modelRegistry,
    gatewayEngine,
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Provision test entities
  const orgId = "org_resilience";
  const wsId = "ws_resilience";
  const envId = "env_resilience";

  const creds = generateApiKeyCredentials("development");
  const secretHash = hashApiKey(creds.secretPart, pepper);

  await keyRepo.insert({
    id: creds.id,
    organizationId: orgId,
    workspaceId: wsId,
    environmentId: envId,
    environment: "development",
    name: "Resilience Test Key",
    prefix: creds.prefix,
    secretHash,
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
  } as any);

  keyRepo.setTenantState(orgId, {
    organizationStatus: "active",
    workspaceStatus: "active",
    environmentStatus: "active",
  });

  const secretKey = creds.fullSecret;

  const createdModel = await modelRegistry.createModel({
    canonicalId: "anthropic/claude-3-5-sonnet",
    displayName: "Claude 3.5 Sonnet",
    family: "claude-3-5",
    category: "chat",
    status: "active",
    customerVisible: true,
    routingEligible: true,
    description: "Sonnet model",
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: false,
    inputModalities: ["text"],
    outputModalities: ["text"],
    capabilities: ["text.generate", "streaming", "tools.call", "structured_output"],
  }, "admin_1");

  // Providers
  const pAnthropic = await providerService.createProvider({
    code: "anthropic",
    displayName: "Anthropic",
    adapterType: "anthropic",
    baseUrl: "https://api.anthropic.com",
    priority: 10,
    enabled: true,
    status: "active",
  }, "admin_1");

  const pOpenAI = await providerService.createProvider({
    code: "openai",
    displayName: "OpenAI",
    adapterType: "openai",
    baseUrl: "https://api.openai.com",
    priority: 20,
    enabled: true,
    status: "active",
  }, "admin_1");

  await providerService.createCredential(pAnthropic.id, {
    name: "Anthropic Key",
    environment: "production",
    rawSecret: "sk-ant-test-key",
    encryptionKeyVersion: "v1",
  }, "admin_1");

  await providerService.createCredential(pOpenAI.id, {
    name: "OpenAI Key",
    environment: "production",
    rawSecret: "sk-oai-test-key",
    encryptionKeyVersion: "v1",
  }, "admin_1");

  // Route 1: Anthropic (Priority 10)
  const rAnthropic = await modelRegistry.addProviderRoute({
    modelId: createdModel.id,
    providerId: pAnthropic.id,
    providerModelId: "claude-3-5-sonnet-20241022",
    region: "global",
    priority: 10,
    status: "active",
    routingEligible: true,
  }, "admin_1");

  // Route 2: OpenAI (Priority 20)
  const rOpenAI = await modelRegistry.addProviderRoute({
    modelId: createdModel.id,
    providerId: pOpenAI.id,
    providerModelId: "gpt-4o",
    region: "global",
    priority: 20,
    status: "active",
    routingEligible: true,
  }, "admin_1");

  return {
    server,
    baseUrl,
    secretKey,
    mockAnthropic,
    mockOpenAI,
    gatewayRepo,
    gatewayEvents,
    createdModel,
    pAnthropic,
    pOpenAI,
    rAnthropic,
    rOpenAI,
    async cleanup() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("Phase 9 — Fallback + Retry + Resilience Engine", () => {
  it("Fallback after 429: Anthropic fails with 429 rate limit -> fallbacks to OpenAI and completes", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      // Primary route (Anthropic) fails with 429
      fixture.mockAnthropic.behavior = async () => {
        throw new GrowXProviderError("provider_rate_limit", "Rate limit exceeded", true, 429);
      };

      // Fallback route (OpenAI) succeeds
      fixture.mockOpenAI.behavior = async (req: any, ctx: any) => ({
        requestId: req.requestId,
        canonicalModelId: req.canonicalModelId,
        providerId: ctx.providerId ?? "openai",
        providerModelId: "gpt-4o",
        providerRequestId: "mock_req_openai",
        finishReason: "stop",
        output: [{ role: "assistant", content: "Response from OpenAI fallback" }],
        usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40, source: "provider_reported" as const },
        timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 20 },
      });

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Hello fallback" }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.choices[0].message.content).toBe("Response from OpenAI fallback");

      expect(fixture.mockAnthropic.callCount).toBe(2); // Attempt 1 + same-route retry Attempt 2
      expect(fixture.mockOpenAI.callCount).toBe(1); // Fallback Attempt 3

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(3);

      expect(attempts[0]!.providerId).toBe(fixture.pAnthropic.id);
      expect(attempts[0]!.status).toBe("failed");
      expect(attempts[0]!.errorCode).toBe("provider_rate_limit");

      expect(attempts[1]!.providerId).toBe(fixture.pAnthropic.id);
      expect(attempts[1]!.status).toBe("failed");

      expect(attempts[2]!.providerId).toBe(fixture.pOpenAI.id);
      expect(attempts[2]!.status).toBe("succeeded");
      expect(attempts[2]!.fallbackReason).toBe("RATE_LIMIT");

      // Verify fallback event was emitted
      expect(fixture.gatewayEvents.fallbackSelectedEvents.length).toBeGreaterThan(0);
      expect(fixture.gatewayEvents.fallbackSelectedEvents[0]!.fromProviderId).toBe(fixture.pAnthropic.id);
      expect(fixture.gatewayEvents.fallbackSelectedEvents[0]!.toProviderId).toBe(fixture.pOpenAI.id);
    } finally {
      await fixture.cleanup();
    }
  });

  it("Same-route retry: Transient 503 on Attempt 1 -> succeeds on Attempt 2 on same route", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      let callNum = 0;
      fixture.mockAnthropic.behavior = async (req: any, ctx: any) => {
        callNum++;
        if (callNum === 1) {
          throw new GrowXProviderError("provider_unavailable", "Temporary 503", true, 503);
        }
        return {
          id: "gen_anthropic_recovered",
          requestId: req.requestId,
          canonicalModelId: req.canonicalModelId,
          providerId: ctx.providerId ?? "anthropic",
          providerModelId: "claude-3-5-sonnet-20241022",
          providerRequestId: "mock_req_anthropic",
          finishReason: "stop",
          output: [{ role: "assistant", content: "Recovered on attempt 2" }],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
          timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 15 },
        };
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Retry same route test" }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.choices[0].message.content).toBe("Recovered on attempt 2");

      expect(fixture.mockAnthropic.callCount).toBe(2);
      expect(fixture.mockOpenAI.callCount).toBe(0); // Never called fallback

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(2);
      expect(attempts[0]!.attemptNumber).toBe(1);
      expect(attempts[0]!.status).toBe("failed");
      expect(attempts[1]!.attemptNumber).toBe(2);
      expect(attempts[1]!.status).toBe("succeeded");
      expect(attempts[1]!.providerId).toBe(fixture.pAnthropic.id);

      // Verify retry scheduled event
      expect(fixture.gatewayEvents.retryScheduledEvents.length).toBe(1);
      expect(fixture.gatewayEvents.retryScheduledEvents[0]!.attemptNumber).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it("Non-retryable 400 Bad Request: Never retries and never falls back", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      fixture.mockAnthropic.behavior = async () => {
        throw new GrowXProviderError("provider_invalid_request", "Invalid parameters for provider", false, 400);
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Bad payload" }],
        }),
      });

      expect(res.status).toBe(400);
      expect(fixture.mockAnthropic.callCount).toBe(1);
      expect(fixture.mockOpenAI.callCount).toBe(0);

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(1);
      expect(attempts[0]!.status).toBe("failed");
      expect(attempts[0]!.errorCode).toBe("provider_invalid_request");
    } finally {
      await fixture.cleanup();
    }
  });

  it("Provider Auth Error (401): Does NOT retry same credential, falls back to alternate provider", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      fixture.mockAnthropic.behavior = async () => {
        throw new GrowXProviderError("provider_authentication_error", "Invalid API key", false, 401);
      };
      fixture.mockOpenAI.behavior = async (req: any, ctx: any) => ({
        id: "gen_fallback_auth",
        requestId: req.requestId,
        canonicalModelId: req.canonicalModelId,
        providerId: ctx.providerId ?? "openai",
        providerModelId: "gpt-4o",
        providerRequestId: "mock_req_openai",
        finishReason: "stop",
        output: [{ role: "assistant", content: "OpenAI saved the day" }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
        timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 15 },
      });

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Auth fallback test" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(fixture.mockAnthropic.callCount).toBe(1); // Denied same-route retry
      expect(fixture.mockOpenAI.callCount).toBe(1); // Succeeded on fallback

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(2);
      expect(attempts[0]!.status).toBe("failed");
      expect(attempts[0]!.errorCode).toBe("provider_authentication_error");
      expect(attempts[1]!.status).toBe("succeeded");
      expect(attempts[1]!.providerId).toBe(fixture.pOpenAI.id);
    } finally {
      await fixture.cleanup();
    }
  });

  it("Streaming pre-token failure: Primary provider stream fails before first token -> falls back to secondary provider", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      // Anthropic fails before emitting any token
      fixture.mockAnthropic.streamBehavior = async function* () {
        throw new GrowXProviderError("provider_server_error", "Stream connect error", true, 500);
      };

      // OpenAI succeeds with stream
      fixture.mockOpenAI.streamBehavior = async function* (req: any, ctx: any) {
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 0,
          type: "response.started",
          timestamp: new Date().toISOString(),
        };
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 1,
          type: "output_text.delta",
          timestamp: new Date().toISOString(),
          delta: "Hello from stream fallback!",
        };
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 2,
          type: "response.completed",
          timestamp: new Date().toISOString(),
          response: {
            id: "gen_stream_openai",
            requestId: req.requestId,
            canonicalModelId: req.canonicalModelId,
            providerId: ctx.providerId ?? "openai",
            providerModelId: "gpt-4o",
            providerRequestId: "mock_req_openai",
            finishReason: "stop",
            output: [{ role: "assistant", content: "Hello from stream fallback!" }],
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
            timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 25 },
          },
        };
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          stream: true,
          messages: [{ role: "user", content: "Streaming pre-token fallback" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const text = await res.text();
      expect(text).toContain("Hello from stream fallback!");

      expect(fixture.mockAnthropic.callCount).toBe(1);
      expect(fixture.mockOpenAI.callCount).toBe(1);

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(2);
      expect(attempts[0]!.emittedClientOutput).toBe(false);
      expect(attempts[1]!.emittedClientOutput).toBe(true);
      expect(attempts[1]!.status).toBe("succeeded");
    } finally {
      await fixture.cleanup();
    }
  });

  it("CRITICAL INVARIANT: Streaming post-token failure: If token emitted -> NO fallback allowed", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      // Anthropic emits first token then crashes mid-stream
      fixture.mockAnthropic.streamBehavior = async function* (req: any) {
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 0,
          type: "response.started",
          timestamp: new Date().toISOString(),
        };
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 1,
          type: "output_text.delta",
          timestamp: new Date().toISOString(),
          delta: "Partial output...",
        };
        // Simulated network drop mid-generation
        throw new GrowXProviderError("provider_server_error", "Mid-stream disconnect", true, 500);
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          stream: true,
          messages: [{ role: "user", content: "Streaming post-token crash" }],
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Partial output...");

      // MANDATORY SAFETY PROOF: OpenAI fallback was NEVER called
      expect(fixture.mockOpenAI.callCount).toBe(0);
      expect(fixture.mockAnthropic.callCount).toBe(1);

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBe(1);
      expect(attempts[0]!.emittedClientOutput).toBe(true);
      expect(attempts[0]!.status).toBe("failed");
    } finally {
      await fixture.cleanup();
    }
  });

  it("Tool call delta commit point: Emitting tool_call delta commits stream -> NO fallback", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      fixture.mockAnthropic.streamBehavior = async function* (req: any) {
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 0,
          type: "response.started",
          timestamp: new Date().toISOString(),
        };
        yield {
          requestId: req.requestId,
          responseId: `resp_${req.requestId}`,
          sequence: 1,
          type: "tool_call.delta",
          timestamp: new Date().toISOString(),
          delta: '{"location": "Tokyo"}',
          toolCall: {
            index: 0,
            id: "call_123",
            name: "get_weather",
            argumentsDelta: '{"location": "Tokyo"}',
          },
        };
        throw new GrowXProviderError("provider_timeout", "Stream timed out after tool call delta", true, 504);
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          stream: true,
          messages: [{ role: "user", content: "What is the weather?" }],
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Tokyo");

      // No fallback allowed after tool delta
      expect(fixture.mockOpenAI.callCount).toBe(0);
      expect(fixture.mockAnthropic.callCount).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("All routes fail: Exhausts candidates and returns deterministic 503 error with complete attempt history", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      fixture.mockAnthropic.behavior = async () => {
        throw new GrowXProviderError("provider_unavailable", "Anthropic is down", true, 503);
      };
      fixture.mockOpenAI.behavior = async () => {
        throw new GrowXProviderError("provider_unavailable", "OpenAI is down", true, 503);
      };

      const res = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Total failure test" }],
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("provider_unavailable");

      const requestId = res.headers.get("x-growx-request-id")!;
      const attempts = await fixture.gatewayRepo.listAttemptsByRequestId(requestId);
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(attempts.every((a) => a.status === "failed")).toBe(true);

      // Verify retry exhausted event
      expect(fixture.gatewayEvents.retryExhaustedEvents.length).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("Privileged debug inspection API: GET /internal/gateway/requests/:id/attempts returns attempt history", async () => {
    const fixture = await setupResilienceTestFixture();
    try {
      fixture.mockAnthropic.behavior = async () => {
        throw new GrowXProviderError("provider_rate_limit", "Rate limited", true, 429);
      };
      fixture.mockOpenAI.behavior = async (req: any, ctx: any) => ({
        id: "gen_debug_test",
        requestId: req.requestId,
        canonicalModelId: req.canonicalModelId,
        providerId: ctx.providerId ?? "openai",
        providerModelId: "gpt-4o",
        providerRequestId: "mock_req_debug",
        finishReason: "stop",
        output: [{ role: "assistant", content: "Debug test OK" }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, source: "provider_reported" as const },
        timing: { startedAt: new Date(), completedAt: new Date(), latencyMs: 15 },
      });

      const execRes = await fetch(`${fixture.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.secretKey}`,
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Debug attempts endpoint test" }],
        }),
      });

      expect(execRes.status).toBe(200);
      const reqId = execRes.headers.get("x-growx-request-id")!;

      const debugRes = await fetch(`${fixture.baseUrl}/internal/gateway/requests/${reqId}/attempts`);
      expect(debugRes.status).toBe(200);
      const debugData = await debugRes.json();
      expect(debugData.requestId).toBe(reqId);
      expect(Array.isArray(debugData.attempts)).toBe(true);
      expect(debugData.attempts.length).toBe(3);
      expect(debugData.attempts[0].attemptNumber).toBe(1);
      expect(debugData.attempts[1].attemptNumber).toBe(2);
      expect(debugData.attempts[2].attemptNumber).toBe(3);
    } finally {
      await fixture.cleanup();
    }
  });
});
