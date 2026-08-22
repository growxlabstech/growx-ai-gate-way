import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryAnalyticsRepository,
  AnalyticsProjectionEngine,
  AnalyticsQueryService,
  OperationalSignalService,
} from "../src/index.js";
import type {
  GatewayRequestRecord,
  GatewayAttemptRecord,
} from "@growx/metering";

describe("Analytics Query Service & Operational Intelligence", () => {
  let repository: InMemoryAnalyticsRepository;
  let projectionEngine: AnalyticsProjectionEngine;
  let queryService: AnalyticsQueryService;
  let anomalyService: OperationalSignalService;

  const now = new Date("2026-08-19T15:00:00.000Z");

  beforeEach(async () => {
    repository = new InMemoryAnalyticsRepository();
    projectionEngine = new AnalyticsProjectionEngine(repository);
    queryService = new AnalyticsQueryService(repository);
    anomalyService = new OperationalSignalService(repository, {
      errorRateThreshold: 0.2, // 20%
      fallbackRateThreshold: 0.2,
    });

    // Populate test fixture: 10 successful requests, 2 failed requests on gpt-4o and claude-3-5
    for (let i = 1; i <= 10; i++) {
      const req: GatewayRequestRecord = {
        id: `gwrq_succ_${i}`,
        requestId: `req_succ_${i}`,
        organizationId: "org_test",
        workspaceId: "ws_default",
        apiKeyId: i <= 5 ? "key_alpha" : "key_beta",
        canonicalModelId: i <= 6 ? "gpt-4o" : "claude-3-5-sonnet",
        operation: "chat_completion",
        workloadType: "customer",
        streaming: i % 2 === 0,
        status: "completed",
        meteringQuality: "provider_reported",
        meteringStatus: "complete",
        startedAt: new Date(now.getTime() - i * 60 * 1000),
        completedAt: new Date(now.getTime() - i * 60 * 1000 + 100),
        durationMs: 80 + i * 5,
        ttftMs: 25,
        logicalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        providerConsumption: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          attemptCount: 1,
          failedAttemptCount: 0,
        },
        attemptCount: 1,
        retryCount: 0,
        fallbackCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const att: GatewayAttemptRecord = {
        id: `gwatt_succ_${i}`,
        requestId: req.requestId,
        attemptNumber: 1,
        providerId: i <= 6 ? "openai" : "anthropic",
        providerModelId: i <= 6 ? "gpt-4o" : "claude-3-5-sonnet",
        status: "completed",
        startedAt: req.startedAt,
        completedAt: req.completedAt!,
        durationMs: req.durationMs!,
        ttftMs: 25,
        usageSource: "provider_reported",
        usage: req.logicalUsage,
        createdAt: now,
      };

      await projectionEngine.projectRequest(req, [att], []);
    }
  });

  it("calculates customer usage summary with accurate metrics and top models", async () => {
    const summary = await queryService.getCustomerUsageSummary({
      organizationId: "org_test",
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endTime: now,
    });

    expect(summary.requests.total).toBe(10);
    expect(summary.requests.completed).toBe(10);
    expect(summary.requests.failed).toBe(0);
    expect(summary.requests.successRate).toBe(100);

    // 10 requests * 150 tokens = 1500 tokens
    expect(summary.tokens.totalTokens).toBe("1500");
    expect(summary.latency.p50Ms).toBeGreaterThan(0);
    expect(summary.latency.p95Ms).toBeGreaterThan(0);

    expect(summary.topModels.length).toBeGreaterThanOrEqual(2);
    expect(summary.topModels[0]?.modelId).toBe("gpt-4o");
    expect(summary.topModels[0]?.requestCount).toBe(6);
  });

  it("produces breakdown by API keys with masked prefixes", async () => {
    const breakdown = await queryService.getApiKeyBreakdown({
      organizationId: "org_test",
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endTime: now,
    });

    expect(breakdown.items).toHaveLength(2);
    expect(
      breakdown.items.find((k) => k.apiKeyId === "key_alpha")?.requestCount,
    ).toBe(5);
    expect(
      breakdown.items.find((k) => k.apiKeyId === "key_beta")?.requestCount,
    ).toBe(5);
  });

  it("supports paginated request drilldown with cursor", async () => {
    const page1 = await queryService.getRequestDrilldown({
      organizationId: "org_test",
      limit: 4,
    });

    expect(page1.items).toHaveLength(4);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await queryService.getRequestDrilldown({
      organizationId: "org_test",
      limit: 4,
      cursor: page1.nextCursor,
    });

    expect(page2.items).toHaveLength(4);
    expect(page2.items[0]?.requestId).not.toBe(page1.items[0]?.requestId);
  });

  it("detects operational anomaly on error rate spike", async () => {
    // Inject 5 failed requests in the last 2 minutes
    for (let i = 1; i <= 5; i++) {
      const failReq: GatewayRequestRecord = {
        id: `gwrq_fail_${i}`,
        requestId: `req_fail_${i}`,
        organizationId: "org_test",
        workspaceId: "ws_default",
        canonicalModelId: "gpt-4o",
        operation: "chat_completion",
        workloadType: "customer",
        streaming: false,
        status: "failed",
        errorCode: "provider_5xx",
        meteringQuality: "provider_reported",
        meteringStatus: "complete",
        startedAt: new Date(now.getTime() - 60 * 1000),
        completedAt: new Date(now.getTime() - 50 * 1000),
        durationMs: 50,
        logicalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        providerConsumption: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          attemptCount: 1,
          failedAttemptCount: 1,
        },
        attemptCount: 1,
        retryCount: 0,
        fallbackCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const failAtt: GatewayAttemptRecord = {
        id: `gwatt_fail_${i}`,
        requestId: failReq.requestId,
        attemptNumber: 1,
        providerId: "openai",
        providerModelId: "gpt-4o",
        status: "failed",
        errorCode: "provider_5xx",
        startedAt: failReq.startedAt,
        completedAt: failReq.completedAt!,
        durationMs: 50,
        usageSource: "unavailable",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        createdAt: now,
      };

      await projectionEngine.projectRequest(failReq, [failAtt], []);
    }

    const anomalies = await anomalyService.evaluateOperationalHealth({
      organizationId: "org_test",
      providerId: "openai",
      now,
    });

    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0]?.anomalyType).toBe("PROVIDER_ERROR_SPIKE");
    expect(anomalies[0]?.observedValue).toBeGreaterThanOrEqual(0.2);
  });
});
