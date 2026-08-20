import { describe, expect, it } from "vitest";
import { workerName, AnalyticsProjectionWorker } from "../src/index.js";
import { InMemoryAnalyticsRepository } from "@growx/analytics";
import type { GatewayRequestRecord } from "@growx/metering";

describe("Analytics Projection Worker", () => {
  it("has an identity", () => {
    expect(workerName).toBe("analytics-worker");
  });

  it("processes unprojected requests and checkpoints cursor", async () => {
    const repository = new InMemoryAnalyticsRepository();
    const worker = new AnalyticsProjectionWorker({ repository });

    const now = new Date();
    const req: GatewayRequestRecord = {
      id: "gwrq_wrk_1",
      requestId: "req_wrk_1",
      organizationId: "org_wrk",
      workspaceId: "ws_wrk",
      canonicalModelId: "gpt-4o",
      operation: "chat_completion",
      workloadType: "customer",
      streaming: false,
      status: "completed",
      meteringQuality: "provider_reported",
      meteringStatus: "complete",
      startedAt: now,
      completedAt: new Date(now.getTime() + 50),
      durationMs: 50,
      logicalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      providerConsumption: { inputTokens: 10, outputTokens: 5, totalTokens: 15, attemptCount: 1, failedAttemptCount: 0 },
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await repository.saveRequestRecord(req);

    const res1 = await worker.runOnce();
    expect(res1.processedCount).toBe(1);

    const checkpoint = await repository.getCheckpoint("analytics_main_projector");
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.processedEventsCount).toBe(1n);

    // Second run should skip already processed items
    const res2 = await worker.runOnce();
    expect(res2.processedCount).toBe(0);
  });
});
