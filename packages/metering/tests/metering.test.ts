import { describe, expect, it } from "vitest";
import {
  InMemoryUsageLedgerRepository,
  normalizeAnthropicUsage,
  normalizeGeminiUsage,
  normalizeOpenAIUsage,
  normalizeProviderUsage,
  UsageAggregateProjector,
  UsageMeteringService,
  type UsageEvent,
} from "../src/index.js";

describe("Usage Metering & Authoritative Ledger", () => {
  it("meters simple non-streaming request with 1 provider attempt", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    const req = await service.recordRequestStarted({
      requestId: "req_simple_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
      canonicalModelId: "gpt-4o",
    });
    expect(req.status).toBe("executing");

    const attempt = await service.recordAttemptStarted({
      requestId: "req_simple_1",
      attemptNumber: 1,
      providerId: "openai",
      providerModelId: "gpt-4o-2024-05-13",
    });
    expect(attempt.status).toBe("started");

    await service.recordAttemptCompleted({
      attemptId: attempt.id,
      requestId: "req_simple_1",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        source: "provider_reported",
        confidence: "exact",
      },
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_simple_1",
      status: "completed",
    });

    expect(finalized.status).toBe("completed");
    expect(finalized.attemptCount).toBe(1);
    expect(finalized.retryCount).toBe(0);
    expect(finalized.fallbackCount).toBe(0);
    expect(finalized.logicalUsage.inputTokens).toBe(100);
    expect(finalized.logicalUsage.outputTokens).toBe(50);
    expect(finalized.providerConsumption.inputTokens).toBe(100);
    expect(finalized.providerConsumption.outputTokens).toBe(50);
    expect(finalized.meteringQuality).toBe("provider_reported");

    const events = await repo.listUsageEventsForRequest("req_simple_1");
    expect(events.length).toBe(3); // input, output, total
    expect(events.find((e) => e.usageType === "input_tokens")?.quantity).toBe(100n);
    expect(events.find((e) => e.usageType === "output_tokens")?.quantity).toBe(50n);
  });

  it("handles streaming finalization with cached and reasoning tokens", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_stream_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "o1-preview",
      streaming: true,
    });

    const attempt = await service.recordAttemptStarted({
      requestId: "req_stream_1",
      attemptNumber: 1,
      providerId: "openai",
      providerModelId: "o1-preview",
    });

    await service.recordAttemptCompleted({
      attemptId: attempt.id,
      requestId: "req_stream_1",
      ttftMs: 250,
      usage: {
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        cachedInputTokens: 300,
        reasoningTokens: 150,
        source: "provider_stream_reported",
      },
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_stream_1",
      status: "completed",
      ttftMs: 250,
    });

    expect(finalized.logicalUsage.cachedInputTokens).toBe(300);
    expect(finalized.logicalUsage.reasoningTokens).toBe(150);
    expect(finalized.ttftMs).toBe(250);

    const events = await repo.listUsageEventsForRequest("req_stream_1");
    expect(events.length).toBe(5); // input, output, total, cached, reasoning
    expect(events.find((e) => e.usageType === "cached_input_tokens")?.quantity).toBe(300n);
    expect(events.find((e) => e.usageType === "reasoning_tokens")?.quantity).toBe(150n);
  });

  it("records failed attempt + fallback attempt with separate provider consumptions and single logical usage", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_fallback_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "claude-3-5-sonnet",
    });

    // Attempt 1 on Anthropic fails after consuming input tokens
    const attempt1 = await service.recordAttemptStarted({
      requestId: "req_fallback_1",
      attemptNumber: 1,
      providerId: "anthropic",
      providerModelId: "claude-3-5-sonnet-20241022",
    });

    await service.recordAttemptFailed({
      attemptId: attempt1.id,
      requestId: "req_fallback_1",
      errorCategory: "provider_overloaded",
      errorCode: "rate_limit_error",
      usage: {
        inputTokens: 1000,
        outputTokens: 0,
        totalTokens: 1000,
        source: "provider_reported",
      },
    });

    // Attempt 2 on Bedrock (fallback) succeeds
    const attempt2 = await service.recordAttemptStarted({
      requestId: "req_fallback_1",
      attemptNumber: 2,
      providerId: "aws-bedrock",
      providerModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      fallbackReason: "primary_overloaded",
    });

    await service.recordAttemptCompleted({
      attemptId: attempt2.id,
      requestId: "req_fallback_1",
      usage: {
        inputTokens: 1000,
        outputTokens: 400,
        totalTokens: 1400,
        source: "provider_reported",
      },
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_fallback_1",
      status: "completed",
    });

    expect(finalized.attemptCount).toBe(2);
    expect(finalized.retryCount).toBe(0);
    expect(finalized.fallbackCount).toBe(1);

    // Customer logical usage is ONLY the successful response
    expect(finalized.logicalUsage.inputTokens).toBe(1000);
    expect(finalized.logicalUsage.outputTokens).toBe(400);
    expect(finalized.logicalUsage.totalTokens).toBe(1400);

    // Provider consumption includes BOTH attempts (1000 + 1000 = 2000 input tokens)
    expect(finalized.providerConsumption.inputTokens).toBe(2000);
    expect(finalized.providerConsumption.outputTokens).toBe(400);
    expect(finalized.providerConsumption.totalTokens).toBe(2400);
    expect(finalized.providerConsumption.attemptCount).toBe(2);
    expect(finalized.providerConsumption.failedAttemptCount).toBe(1);
  });

  it("handles retry on the same provider and increments retryCount", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_retry_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "gpt-4o",
    });

    const attempt1 = await service.recordAttemptStarted({
      requestId: "req_retry_1",
      attemptNumber: 1,
      providerId: "openai",
      providerModelId: "gpt-4o",
    });

    await service.recordAttemptFailed({
      attemptId: attempt1.id,
      requestId: "req_retry_1",
      errorCategory: "transient_network",
      errorCode: "econnreset",
    });

    const attempt2 = await service.recordAttemptStarted({
      requestId: "req_retry_1",
      attemptNumber: 2,
      providerId: "openai",
      providerModelId: "gpt-4o",
      retryReason: "transient_network",
    });

    await service.recordAttemptCompleted({
      attemptId: attempt2.id,
      requestId: "req_retry_1",
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, source: "provider_reported" },
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_retry_1",
      status: "completed",
    });

    expect(finalized.attemptCount).toBe(2);
    expect(finalized.retryCount).toBe(1);
    expect(finalized.fallbackCount).toBe(0);
    expect(finalized.logicalUsage.inputTokens).toBe(120);
    expect(finalized.logicalUsage.outputTokens).toBe(80);
  });

  it("registers zero provider usage on early policy or quota rejection", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_rejected_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "prohibited-model",
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_rejected_1",
      status: "rejected",
      errorCode: "policy_denied",
    });

    expect(finalized.status).toBe("rejected");
    expect(finalized.attemptCount).toBe(0);
    expect(finalized.logicalUsage.inputTokens).toBe(0);
    expect(finalized.providerConsumption.inputTokens).toBe(0);
    expect(finalized.providerConsumption.attemptCount).toBe(0);

    const events = await repo.listUsageEventsForRequest("req_rejected_1");
    expect(events.length).toBe(0);
  });

  it("handles estimated tokens when provider does not report usage", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_est_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "custom-oss-model",
    });

    const attempt = await service.recordAttemptStarted({
      requestId: "req_est_1",
      attemptNumber: 1,
      providerId: "custom-endpoint",
      providerModelId: "llama-3-8b",
    });

    const normalized = normalizeProviderUsage(
      "custom-endpoint",
      {}, // Empty payload without usage
      { prompt: "Hello world, what is the capital of France?", max_tokens: 64 }
    );

    expect(normalized.source).toBe("estimated");

    await service.recordAttemptCompleted({
      attemptId: attempt.id,
      requestId: "req_est_1",
      usage: normalized,
    });

    const finalized = await service.recordRequestCompleted({
      requestId: "req_est_1",
      status: "completed",
    });

    expect(finalized.meteringQuality).toBe("estimated");
    expect(finalized.logicalUsage.inputTokens).toBeGreaterThan(0);
  });

  it("reconciles estimated usage with late exact usage via immutable adjustment events", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    await service.recordRequestStarted({
      requestId: "req_reconc_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      canonicalModelId: "model_x",
    });

    const attempt = await service.recordAttemptStarted({
      requestId: "req_reconc_1",
      attemptNumber: 1,
      providerId: "prov_x",
      providerModelId: "model_x",
    });

    // Initial estimate: 1000 input, 500 output
    await service.recordAttemptCompleted({
      attemptId: attempt.id,
      requestId: "req_reconc_1",
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, source: "estimated" },
    });

    await service.recordRequestCompleted({
      requestId: "req_reconc_1",
      status: "completed",
    });

    let aggList = await repo.queryAggregates({ organizationId: "org_1" });
    expect(aggList[0]?.inputTokens).toBe(1000n);
    expect(aggList[0]?.outputTokens).toBe(500n);

    // Exact usage arrives later: 950 input (-50 diff), 520 output (+20 diff)
    await service.reconcileUsage({
      requestId: "req_reconc_1",
      actualInputTokens: 950,
      actualOutputTokens: 520,
      reason: "Batch log sync reconciliation",
      operatorId: "worker.reconciliation",
    });

    const updatedReq = await repo.getRequestRecord("req_reconc_1");
    expect(updatedReq?.meteringStatus).toBe("reconciled");
    expect(updatedReq?.logicalUsage.inputTokens).toBe(950);
    expect(updatedReq?.logicalUsage.outputTokens).toBe(520);

    // Aggregate updated correctly through adjustment events
    aggList = await repo.queryAggregates({ organizationId: "org_1" });
    expect(aggList[0]?.inputTokens).toBe(950n);
    expect(aggList[0]?.outputTokens).toBe(520n);

    // Verify reconciliation records
    const reconciliations = await repo.listReconciliationsForRequest("req_reconc_1");
    expect(reconciliations.length).toBe(2);
    expect(reconciliations.find((r) => r.usageType === "input_tokens")?.differenceQuantity).toBe(-50n);
    expect(reconciliations.find((r) => r.usageType === "output_tokens")?.differenceQuantity).toBe(20n);
  });

  it("guarantees idempotent ingestion when duplicate events are delivered 100 times", async () => {
    const repo = new InMemoryUsageLedgerRepository();

    const sampleEvent: UsageEvent = {
      id: "evt_100",
      eventId: "evt_100",
      requestId: "req_dup_1",
      organizationId: "org_dup",
      workspaceId: "ws_dup",
      canonicalModelId: "gpt-4o",
      usageType: "input_tokens",
      quantity: 500n,
      unit: "token",
      source: "provider_reported",
      confidence: "exact",
      workloadType: "customer",
      occurredAt: new Date(),
      ingestedAt: new Date(),
      idempotencyKey: "dup_key_test_1",
    };

    const promises = Array.from({ length: 100 }, () => repo.appendUsageEvent(sampleEvent));
    const results = await Promise.all(promises);

    const appended = results.filter((r) => r === "appended").length;
    const duplicates = results.filter((r) => r === "duplicate").length;

    expect(appended).toBe(1);
    expect(duplicates).toBe(99);

    const aggregates = await repo.queryAggregates({ organizationId: "org_dup" });
    expect(aggregates[0]?.inputTokens).toBe(500n);
  });

  it("handles BigInt token aggregates without precision loss", async () => {
    const repo = new InMemoryUsageLedgerRepository();

    const largeQty = 9_007_199_254_740_991n + 5000n; // Greater than Number.MAX_SAFE_INTEGER

    const event: UsageEvent = {
      id: "evt_large_1",
      eventId: "evt_large_1",
      requestId: "req_large_1",
      organizationId: "org_big",
      workspaceId: "ws_big",
      canonicalModelId: "gpt-4o",
      usageType: "input_tokens",
      quantity: largeQty,
      unit: "token",
      source: "provider_reported",
      confidence: "exact",
      workloadType: "customer",
      occurredAt: new Date(),
      ingestedAt: new Date(),
      idempotencyKey: "large_key_1",
    };

    await repo.appendUsageEvent(event);

    const aggregates = await repo.queryAggregates({ organizationId: "org_big" });
    expect(aggregates[0]?.inputTokens).toBe(largeQty);
  });

  it("rebuilds aggregates from raw immutable event stream", async () => {
    const repo = new InMemoryUsageLedgerRepository();

    const now = new Date();
    for (let i = 1; i <= 10; i++) {
      await repo.appendUsageEvent({
        id: `evt_rebuild_${i}`,
        eventId: `evt_rebuild_${i}`,
        requestId: `req_${i}`,
        organizationId: "org_rebuild",
        workspaceId: "ws_rebuild",
        canonicalModelId: "gpt-4o",
        usageType: "input_tokens",
        quantity: 100n,
        unit: "token",
        source: "provider_reported",
        confidence: "exact",
        workloadType: "customer",
        occurredAt: now,
        ingestedAt: now,
        idempotencyKey: `reb_key_${i}`,
      });
    }

    let aggregates = await repo.queryAggregates({ organizationId: "org_rebuild" });
    expect(aggregates[0]?.inputTokens).toBe(1000n);

    // Rebuild
    const rebuildResult = await repo.rebuildAggregates();
    expect(rebuildResult.processedEvents).toBe(10);

    aggregates = await repo.queryAggregates({ organizationId: "org_rebuild" });
    expect(aggregates[0]?.inputTokens).toBe(1000n);
  });

  it("normalizes provider usage correctly across OpenAI, Anthropic, and Gemini fixtures", () => {
    // OpenAI fixture
    const openAIFixture = {
      prompt_tokens: 120,
      completion_tokens: 85,
      total_tokens: 205,
      prompt_tokens_details: { cached_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 25 },
    };
    const normOpenAI = normalizeOpenAIUsage(openAIFixture);
    expect(normOpenAI.inputTokens).toBe(120);
    expect(normOpenAI.outputTokens).toBe(85);
    expect(normOpenAI.cachedInputTokens).toBe(40);
    expect(normOpenAI.reasoningTokens).toBe(25);
    expect(normOpenAI.source).toBe("provider_reported");

    // Anthropic fixture
    const anthropicFixture = {
      input_tokens: 300,
      output_tokens: 150,
      cache_read_input_tokens: 100,
    };
    const normAnthropic = normalizeAnthropicUsage(anthropicFixture);
    expect(normAnthropic.inputTokens).toBe(300);
    expect(normAnthropic.outputTokens).toBe(150);
    expect(normAnthropic.cachedInputTokens).toBe(100);
    expect(normAnthropic.totalTokens).toBe(450);

    // Gemini fixture
    const geminiFixture = {
      promptTokenCount: 220,
      candidatesTokenCount: 90,
      totalTokenCount: 310,
      cachedContentTokenCount: 50,
    };
    const normGemini = normalizeGeminiUsage(geminiFixture);
    expect(normGemini.inputTokens).toBe(220);
    expect(normGemini.outputTokens).toBe(90);
    expect(normGemini.totalTokens).toBe(310);
    expect(normGemini.cachedInputTokens).toBe(50);
  });

  it("differentiates health_probe workloads from customer workloads", async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const service = new UsageMeteringService({ repository: repo });

    const req = await service.recordRequestStarted({
      requestId: "req_health_probe_1",
      organizationId: "system",
      workspaceId: "system",
      canonicalModelId: "gpt-4o",
      workloadType: "health_probe",
    });

    expect(req.workloadType).toBe("health_probe");

    const attempt = await service.recordAttemptStarted({
      requestId: "req_health_probe_1",
      attemptNumber: 1,
      providerId: "openai",
      providerModelId: "gpt-4o",
    });

    await service.recordAttemptCompleted({
      attemptId: attempt.id,
      requestId: "req_health_probe_1",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, source: "provider_reported" },
    });

    await service.recordRequestCompleted({
      requestId: "req_health_probe_1",
      status: "completed",
    });

    const events = await repo.listUsageEventsForRequest("req_health_probe_1");
    expect(events[0]?.workloadType).toBe("health_probe");
  });
});
