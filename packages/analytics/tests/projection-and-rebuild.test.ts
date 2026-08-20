import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryAnalyticsRepository,
  AnalyticsProjectionEngine,
  AnalyticsRebuildService,
  getBucketBoundaries,
} from "../src/index.js";
import type { GatewayRequestRecord, GatewayAttemptRecord, UsageEvent } from "@growx/metering";

describe("Analytics Projection & Rebuild Engine", () => {
  let repository: InMemoryAnalyticsRepository;
  let projectionEngine: AnalyticsProjectionEngine;
  let rebuildService: AnalyticsRebuildService;

  const now = new Date("2026-08-19T14:30:00.000Z");

  beforeEach(() => {
    repository = new InMemoryAnalyticsRepository();
    projectionEngine = new AnalyticsProjectionEngine(repository);
    rebuildService = new AnalyticsRebuildService(repository);
  });

  it("calculates bucket boundaries in UTC correctly", () => {
    const hourly = getBucketBoundaries(now, "hour");
    expect(hourly.bucketStart.toISOString()).toBe("2026-08-19T14:00:00.000Z");
    expect(hourly.bucketEnd.toISOString()).toBe("2026-08-19T14:59:59.999Z");

    const daily = getBucketBoundaries(now, "day");
    expect(daily.bucketStart.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(daily.bucketEnd.toISOString()).toBe("2026-08-19T23:59:59.999Z");
  });

  it("projects single request, attempt, and token events into hourly and daily rollups", async () => {
    const req: GatewayRequestRecord = {
      id: "gwrq_test_1",
      requestId: "req_test_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      canonicalModelId: "gpt-4o",
      operation: "chat_completion",
      workloadType: "customer",
      streaming: false,
      status: "completed",
      meteringQuality: "provider_reported",
      meteringStatus: "complete",
      startedAt: now,
      completedAt: new Date(now.getTime() + 120),
      durationMs: 120,
      ttftMs: 35,
      logicalUsage: {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
        cachedInputTokens: 10,
        reasoningTokens: 0,
      },
      providerConsumption: {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      },
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const attempt: GatewayAttemptRecord = {
      id: "gwatt_test_1",
      requestId: "req_test_1",
      attemptNumber: 1,
      providerId: "openai",
      providerModelId: "gpt-4o-2024-08-06",
      status: "completed",
      startedAt: now,
      completedAt: new Date(now.getTime() + 120),
      durationMs: 120,
      ttftMs: 35,
      usageSource: "provider_reported",
      usage: {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      },
      createdAt: now,
    };

    const event: UsageEvent = {
      id: "usevt_1",
      eventId: "evt_1",
      requestId: "req_test_1",
      attemptId: "gwatt_test_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      canonicalModelId: "gpt-4o",
      providerId: "openai",
      providerModelId: "gpt-4o-2024-08-06",
      usageType: "input_tokens",
      quantity: 50n,
      source: "provider_reported",
      confidence: "exact",
      operation: "chat_completion",
      workloadType: "customer",
      occurredAt: now,
      idempotencyKey: "idem_1",
      createdAt: now,
    };

    await projectionEngine.projectRequest(req, [attempt], [event]);

    // Check hourly rollup
    const hourly = await repository.queryRollups({
      organizationId: "org_1",
      startTime: new Date("2026-08-19T14:00:00Z"),
      endTime: new Date("2026-08-19T15:00:00Z"),
      granularity: "hour",
    });

    expect(hourly).toHaveLength(1);
    expect(hourly[0]?.requestsTotal).toBe(1);
    expect(hourly[0]?.requestsCompleted).toBe(1);
    expect(hourly[0]?.inputTokens).toBe(50n);
    expect(hourly[0]?.outputTokens).toBe(25n);
    expect(hourly[0]?.totalTokens).toBe(75n);
    expect(hourly[0]?.providerInputTokens).toBe(50n);

    // Check daily rollup
    const daily = await repository.queryRollups({
      organizationId: "org_1",
      startTime: new Date("2026-08-19T00:00:00Z"),
      endTime: new Date("2026-08-19T23:59:59Z"),
      granularity: "day",
    });

    expect(daily).toHaveLength(1);
    expect(daily[0]?.requestsTotal).toBe(1);
    expect(daily[0]?.totalTokens).toBe(75n);
  });

  it("rebuilds all rollups from authoritative raw ledger records with exact match", async () => {
    const req1: GatewayRequestRecord = {
      id: "gwrq_test_1",
      requestId: "req_test_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      canonicalModelId: "gpt-4o",
      operation: "chat_completion",
      workloadType: "customer",
      streaming: false,
      status: "completed",
      meteringQuality: "provider_reported",
      meteringStatus: "complete",
      startedAt: now,
      completedAt: new Date(now.getTime() + 100),
      durationMs: 100,
      logicalUsage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
      providerConsumption: { inputTokens: 40, outputTokens: 20, totalTokens: 60, attemptCount: 1, failedAttemptCount: 0 },
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await projectionEngine.projectRequest(req1, [], []);

    const beforeRebuild = await repository.queryRollups({
      organizationId: "org_1",
      startTime: new Date("2026-08-19T00:00:00Z"),
      endTime: new Date("2026-08-19T23:59:59Z"),
      granularity: "day",
    });
    expect(beforeRebuild[0]?.totalTokens).toBe(60n);

    // Perform Rebuild
    const rebuildResult = await rebuildService.rebuildFromAuthoritativeLedger();
    expect(rebuildResult.processedRequests).toBe(1);

    const afterRebuild = await repository.queryRollups({
      organizationId: "org_1",
      startTime: new Date("2026-08-19T00:00:00Z"),
      endTime: new Date("2026-08-19T23:59:59Z"),
      granularity: "day",
    });

    expect(afterRebuild[0]?.totalTokens).toBe(60n);
    expect(afterRebuild[0]?.requestsCompleted).toBe(1);
  });
});
