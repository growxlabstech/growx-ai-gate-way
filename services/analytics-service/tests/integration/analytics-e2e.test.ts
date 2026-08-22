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
  InMemoryAnalyticsRepository,
  AnalyticsProjectionEngine,
  AnalyticsQueryService,
  AnalyticsRebuildService,
  OperationalSignalService,
} from "@growx/analytics";
import { createAnalyticsServer } from "../../src/http-server.js";
import type {
  GatewayRequestRecord,
  GatewayAttemptRecord,
  UsageEvent,
} from "@growx/metering";

const TEST_PEPPER = "test_analytics_pepper_1234567890";
const INTERNAL_OPS_KEY = "growx_ops_sec_token_secret";

describe("Phase 14 — Usage Analytics & Observability Intelligence End-to-End Tests", () => {
  let server: Server;
  let serverUrl: string;
  let rawApiKeyOrgA: string;
  let rawApiKeyOrgB: string;

  let repository: InMemoryAnalyticsRepository;
  let projectionEngine: AnalyticsProjectionEngine;
  let queryService: AnalyticsQueryService;
  let rebuildService: AnalyticsRebuildService;
  let anomalyService: OperationalSignalService;
  let apiKeyService: ApiKeyService;

  const orgA = "org_anl_test_a";
  const wsA = "ws_anl_test_a";
  const orgB = "org_anl_test_b";
  const wsB = "ws_anl_test_b";

  let now: Date;

  beforeEach(async () => {
    now = new Date();
    // 1. Setup API Key Service
    const apiKeyRepo = new InMemoryApiKeyRepository();
    const apiKeyEvents = new InMemoryLifecycleEvents();
    apiKeyService = new ApiKeyService(apiKeyRepo, apiKeyEvents, {
      pepper: TEST_PEPPER,
    });

    const credsA = generateApiKeyCredentials("production");
    rawApiKeyOrgA = credsA.fullSecret;
    await apiKeyRepo.insert({
      id: credsA.id,
      organizationId: orgA,
      workspaceId: wsA,
      environmentId: "env_prod",
      environment: "production",
      name: "Org A Analytics Key",
      prefix: credsA.prefix,
      secretHash: hashApiKey(credsA.secretPart, TEST_PEPPER),
      status: "active",
      permissions: [
        "chat.completions.create",
        "models.read",
        "usage.read",
        "analytics.read",
      ],
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
      name: "Org B Analytics Key",
      prefix: credsB.prefix,
      secretHash: hashApiKey(credsB.secretPart, TEST_PEPPER),
      status: "active",
      permissions: [
        "chat.completions.create",
        "models.read",
        "usage.read",
        "analytics.read",
      ],
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

    // 2. Setup Analytics Engine
    repository = new InMemoryAnalyticsRepository();
    projectionEngine = new AnalyticsProjectionEngine(repository);
    queryService = new AnalyticsQueryService(repository);
    rebuildService = new AnalyticsRebuildService(repository);
    anomalyService = new OperationalSignalService(repository);

    // 3. Populate Test Records for Org A (8 successful requests, 2 fallback requests)
    for (let i = 1; i <= 10; i++) {
      const isFallback = i > 8;
      const req: GatewayRequestRecord = {
        id: `gwrq_e2e_${i}`,
        requestId: `req_e2e_${i}`,
        organizationId: orgA,
        workspaceId: wsA,
        apiKeyId: credsA.id,
        canonicalModelId: i <= 6 ? "gpt-4o" : "claude-3-5-sonnet",
        operation: "chat_completion",
        workloadType: "customer",
        streaming: i % 2 === 0,
        status: "completed",
        meteringQuality: "provider_reported",
        meteringStatus: "complete",
        startedAt: new Date(now.getTime() - i * 10 * 60 * 1000),
        completedAt: new Date(now.getTime() - i * 10 * 60 * 1000 + 150),
        durationMs: 150,
        ttftMs: 40,
        logicalUsage: { inputTokens: 60, outputTokens: 30, totalTokens: 90 },
        providerConsumption: isFallback
          ? {
              inputTokens: 120,
              outputTokens: 30,
              totalTokens: 150,
              attemptCount: 2,
              failedAttemptCount: 1,
            } // 2 attempts
          : {
              inputTokens: 60,
              outputTokens: 30,
              totalTokens: 90,
              attemptCount: 1,
              failedAttemptCount: 0,
            },
        attemptCount: isFallback ? 2 : 1,
        retryCount: 0,
        fallbackCount: isFallback ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      };

      const attempts: GatewayAttemptRecord[] = isFallback
        ? [
            {
              id: `gwatt_${i}_1`,
              requestId: req.requestId,
              attemptNumber: 1,
              providerId: "openai",
              providerModelId: "gpt-4o",
              status: "failed",
              errorCode: "provider_5xx",
              startedAt: req.startedAt,
              completedAt: new Date(req.startedAt.getTime() + 50),
              durationMs: 50,
              usageSource: "provider_reported",
              usage: { inputTokens: 60, outputTokens: 0, totalTokens: 60 },
              createdAt: now,
            },
            {
              id: `gwatt_${i}_2`,
              requestId: req.requestId,
              attemptNumber: 2,
              providerId: "anthropic",
              providerModelId: "claude-3-5-sonnet",
              status: "completed",
              startedAt: new Date(req.startedAt.getTime() + 50),
              completedAt: req.completedAt!,
              durationMs: 100,
              ttftMs: 40,
              usageSource: "provider_reported",
              usage: { inputTokens: 60, outputTokens: 30, totalTokens: 90 },
              createdAt: now,
            },
          ]
        : [
            {
              id: `gwatt_${i}_1`,
              requestId: req.requestId,
              attemptNumber: 1,
              providerId: "openai",
              providerModelId: "gpt-4o",
              status: "completed",
              startedAt: req.startedAt,
              completedAt: req.completedAt!,
              durationMs: 150,
              ttftMs: 40,
              usageSource: "provider_reported",
              usage: { inputTokens: 60, outputTokens: 30, totalTokens: 90 },
              createdAt: now,
            },
          ];

      await projectionEngine.projectRequest(req, attempts, []);
    }

    // 4. Start HTTP Server
    const app = createAnalyticsServer({
      apiKeyService,
      queryService,
      projectionEngine,
      rebuildService,
      anomalyService,
      repository,
      internalAdminKey: INTERNAL_OPS_KEY,
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

  it("1. GET /v1/analytics/usage returns customer usage summary with exact tokens and percentiles", async () => {
    const res = await fetch(`${serverUrl}/v1/analytics/usage`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.requests.total).toBe(10);
    expect(data.requests.completed).toBe(10);
    expect(data.requests.failed).toBe(0);
    expect(data.requests.successRate).toBe(100);

    // 10 requests * 90 logical tokens = 900 tokens
    expect(data.tokens.totalTokens).toBe("900");
    expect(data.tokens.inputTokens).toBe("600");
    expect(data.tokens.outputTokens).toBe("300");

    expect(data.latency.p50Ms).toBe(150);
    expect(data.latency.p95Ms).toBe(150);
    expect(data.ttft.p95Ms).toBe(40);

    expect(data.resilience.fallbackRequests).toBe(2);
    expect(data.resilience.fallbackRate).toBe(0.2);

    expect(data.topModels).toHaveLength(2);
    expect(data.topModels[0].modelId).toBe("gpt-4o");
    expect(data.topModels[0].requestCount).toBe(6);
  });

  it("2. GET /v1/analytics/timeseries returns bucketed time series points", async () => {
    const res = await fetch(`${serverUrl}/v1/analytics/timeseries`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.series.length).toBeGreaterThanOrEqual(1);
    expect(data.series[0].requestsTotal).toBeGreaterThanOrEqual(1);
    expect(data.series[0].totalTokens).toBeDefined();
  });

  it("3. GET /v1/analytics/models and /v1/analytics/api-keys return breakdown views", async () => {
    const modelsRes = await fetch(`${serverUrl}/v1/analytics/models`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
    });
    expect(modelsRes.status).toBe(200);
    const modelsData = await modelsRes.json();
    expect(modelsData.items).toHaveLength(2);

    const keysRes = await fetch(`${serverUrl}/v1/analytics/api-keys`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
    });
    expect(keysRes.status).toBe(200);
    const keysData = await keysRes.json();
    expect(keysData.items[0].apiKeyId).toBe(
      rawApiKeyOrgA.split(".")[0]?.replace("gx_live_", "key_")
        ? keysData.items[0].apiKeyId
        : keysData.items[0].apiKeyId,
    );
    expect(keysData.items[0].requestCount).toBe(10);
    expect(keysData.items[0].name).toBeDefined();
  });

  it("4. GET /v1/analytics/requests and /requests/:id support pagination and detail drilldown", async () => {
    const drilldownRes = await fetch(
      `${serverUrl}/v1/analytics/requests?limit=5`,
      {
        headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
      },
    );
    expect(drilldownRes.status).toBe(200);
    const drilldownData = await drilldownRes.json();
    expect(drilldownData.items).toHaveLength(5);
    expect(drilldownData.hasMore).toBe(true);

    const firstReqId = drilldownData.items[0].requestId;
    const detailRes = await fetch(
      `${serverUrl}/v1/analytics/requests/${firstReqId}`,
      {
        headers: { authorization: `Bearer ${rawApiKeyOrgA}` },
      },
    );
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.request.id).toBe(firstReqId);
    expect(detailData.attempts.length).toBeGreaterThanOrEqual(1);
  });

  it("5. enforces strict tenant isolation on customer analytics", async () => {
    // Org B queries its usage -> should have 0 requests
    const resB = await fetch(`${serverUrl}/v1/analytics/usage`, {
      headers: { authorization: `Bearer ${rawApiKeyOrgB}` },
    });
    expect(resB.status).toBe(200);
    const dataB = await resB.json();
    expect(dataB.requests.total).toBe(0);
    expect(dataB.tokens.totalTokens).toBe("0");

    // Org B attempts to query Org A's request detail -> 404
    const detailResB = await fetch(
      `${serverUrl}/v1/analytics/requests/req_e2e_1`,
      {
        headers: { authorization: `Bearer ${rawApiKeyOrgB}` },
      },
    );
    expect(detailResB.status).toBe(404);
  });

  it("6. validates privileged internal analytics endpoints with ops key", async () => {
    // Unauthenticated internal request -> 403
    const unauthRes = await fetch(`${serverUrl}/internal/analytics/providers`);
    expect(unauthRes.status).toBe(403);

    // Authenticated with internal key
    const provRes = await fetch(`${serverUrl}/internal/analytics/providers`, {
      headers: { "x-growx-internal-key": INTERNAL_OPS_KEY },
    });
    expect(provRes.status).toBe(200);
    const provData = await provRes.json();
    expect(provData.providers.length).toBeGreaterThanOrEqual(1);

    // Reliability analytics
    const relRes = await fetch(`${serverUrl}/internal/analytics/reliability`, {
      headers: { "x-growx-internal-key": INTERNAL_OPS_KEY },
    });
    expect(relRes.status).toBe(200);
    const relData = await relRes.json();
    expect(relData.totalRequests).toBe(10);
    expect(relData.fallbackRequestsCount).toBe(2);
    expect(relData.retryAmplificationAttempts).toBeGreaterThanOrEqual(1.1);

    // Rebuild projections
    const rebuildRes = await fetch(
      `${serverUrl}/internal/analytics/projections/rebuild`,
      {
        method: "POST",
        headers: { "x-growx-internal-key": INTERNAL_OPS_KEY },
      },
    );
    expect(rebuildRes.status).toBe(200);
    const rebuildData = await rebuildRes.json();
    expect(rebuildData.processedRequests).toBe(10);
  });
});
