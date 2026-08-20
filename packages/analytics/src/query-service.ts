import type { AnalyticsRepository } from "./repository.js";
import { LatencyDistributionSketch } from "./distribution.js";
import type {
  CustomerUsageSummary,
  CustomerTimeSeriesResponse,
  TimeSeriesPoint,
  ModelBreakdownItem,
  ApiKeyBreakdownItem,
  WorkspaceBreakdownItem,
  RequestDrilldownResponse,
  InternalProviderAnalyticsSummary,
  InternalReliabilityAnalyticsSummary,
  AnalyticsTimeGranularity,
  AnalyticsRollupRecord,
} from "./types.js";
import { maskApiKey } from "@growx/observability";

export function resolveTimeGranularity(
  startTime: Date,
  endTime: Date,
  requestedGranularity?: AnalyticsTimeGranularity
): "hour" | "day" {
  if (requestedGranularity && requestedGranularity !== "auto") {
    if (requestedGranularity === "day" || requestedGranularity === "month") return "day";
    return "hour";
  }

  const durationMs = endTime.getTime() - startTime.getTime();
  const durationDays = durationMs / (1000 * 60 * 60 * 24);

  if (durationDays > 30) {
    return "day";
  }
  return "hour";
}

export interface QueryCacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class AnalyticsQueryService {
  private cache: Map<string, QueryCacheEntry<any>> = new Map();
  private readonly defaultTtlMs = 15_000; // 15s cache

  constructor(private readonly repository: AnalyticsRepository) {}

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setInCache<T>(key: string, data: T, ttlMs = this.defaultTtlMs): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  public async getCustomerUsageSummary(params: {
    organizationId: string;
    workspaceId?: string;
    apiKeyId?: string;
    startTime: Date;
    endTime: Date;
    granularity?: AnalyticsTimeGranularity;
  }): Promise<CustomerUsageSummary> {
    if (params.startTime > params.endTime) {
      throw new Error("startTime cannot be greater than endTime");
    }

    const granularity = resolveTimeGranularity(params.startTime, params.endTime, params.granularity);
    const cacheKey = `summary:${params.organizationId}:${params.workspaceId ?? ""}:${params.apiKeyId ?? ""}:${params.startTime.toISOString()}:${params.endTime.toISOString()}:${granularity}`;

    const cached = this.getFromCache<CustomerUsageSummary>(cacheKey);
    if (cached) return cached;

    const rollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      startTime: params.startTime,
      endTime: params.endTime,
      granularity,
    });

    let totalRequests = 0;
    let completedRequests = 0;
    let failedRequests = 0;
    let cancelledRequests = 0;
    let rejectedRequests = 0;
    let streamRequests = 0;
    let retriedRequests = 0;
    let fallbackRequests = 0;

    let inputTokens = 0n;
    let outputTokens = 0n;
    let totalTokens = 0n;
    let cachedInputTokens = 0n;
    let reasoningTokens = 0n;

    const latencySketch = new LatencyDistributionSketch();
    const ttftSketch = new LatencyDistributionSketch();

    const modelCounts = new Map<string, { requests: number; tokens: bigint }>();

    for (const r of rollups) {
      totalRequests += r.requestsTotal;
      completedRequests += r.requestsCompleted;
      failedRequests += r.requestsFailed;
      cancelledRequests += r.requestsCancelled;
      rejectedRequests += r.requestsRejected;
      streamRequests += r.streamRequests;
      retriedRequests += r.retryAttempts;
      fallbackRequests += r.fallbackAttempts;

      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      totalTokens += r.totalTokens;
      cachedInputTokens += r.cachedInputTokens;
      reasoningTokens += r.reasoningTokens;

      latencySketch.merge(r.latencySketch);
      ttftSketch.merge(r.ttftSketch);

      if (r.canonicalModelId) {
        const m = modelCounts.get(r.canonicalModelId) ?? { requests: 0, tokens: 0n };
        m.requests += r.requestsTotal;
        m.tokens += r.totalTokens;
        modelCounts.set(r.canonicalModelId, m);
      }
    }

    const successRate = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 10000) / 100 : 100;
    const errorRate = totalRequests > 0 ? Math.round((failedRequests / totalRequests) * 10000) / 100 : 0;
    const retryRate = totalRequests > 0 ? Math.round((retriedRequests / totalRequests) * 10000) / 10000 : 0;
    const fallbackRate = totalRequests > 0 ? Math.round((fallbackRequests / totalRequests) * 10000) / 10000 : 0;

    const topModels = Array.from(modelCounts.entries())
      .map(([modelId, data]) => ({
        modelId,
        requestCount: data.requests,
        totalTokens: data.tokens.toString(),
        sharePercentage: totalRequests > 0 ? Math.round((data.requests / totalRequests) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 5);

    const summary: CustomerUsageSummary = {
      range: {
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        granularity,
      },
      requests: {
        total: totalRequests,
        completed: completedRequests,
        failed: failedRequests,
        cancelled: cancelledRequests,
        rejected: rejectedRequests,
        successRate,
        errorRate,
      },
      tokens: {
        inputTokens: inputTokens.toString(),
        outputTokens: outputTokens.toString(),
        totalTokens: totalTokens.toString(),
        cachedInputTokens: cachedInputTokens.toString(),
        reasoningTokens: reasoningTokens.toString(),
      },
      latency: {
        p50Ms: latencySketch.percentile(50),
        p95Ms: latencySketch.percentile(95),
        p99Ms: latencySketch.percentile(99),
        meanMs: latencySketch.mean(),
      },
      ttft: {
        p50Ms: ttftSketch.percentile(50),
        p95Ms: ttftSketch.percentile(95),
        p99Ms: ttftSketch.percentile(99),
      },
      resilience: {
        retriedRequests,
        fallbackRequests,
        retryRate,
        fallbackRate,
      },
      streaming: {
        streamRequests,
      },
      topModels,
      dataFreshness: {
        lastProjectedAt: new Date().toISOString(),
        lagSeconds: 0,
      },
    };

    this.setInCache(cacheKey, summary);
    return summary;
  }

  public async getCustomerTimeseries(params: {
    organizationId: string;
    workspaceId?: string;
    apiKeyId?: string;
    canonicalModelId?: string;
    startTime: Date;
    endTime: Date;
    granularity?: AnalyticsTimeGranularity;
  }): Promise<CustomerTimeSeriesResponse> {
    const granularity = resolveTimeGranularity(params.startTime, params.endTime, params.granularity);
    const rollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      startTime: params.startTime,
      endTime: params.endTime,
      granularity,
    });

    const timeMap = new Map<string, {
      reqTotal: number;
      reqCompleted: number;
      reqFailed: number;
      inputTokens: bigint;
      outputTokens: bigint;
      totalTokens: bigint;
      latency: LatencyDistributionSketch;
      ttft: LatencyDistributionSketch;
    }>();

    for (const r of rollups) {
      const ts = r.bucketStart.toISOString();
      const entry = timeMap.get(ts) ?? {
        reqTotal: 0,
        reqCompleted: 0,
        reqFailed: 0,
        inputTokens: 0n,
        outputTokens: 0n,
        totalTokens: 0n,
        latency: new LatencyDistributionSketch(),
        ttft: new LatencyDistributionSketch(),
      };

      entry.reqTotal += r.requestsTotal;
      entry.reqCompleted += r.requestsCompleted;
      entry.reqFailed += r.requestsFailed;
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
      entry.totalTokens += r.totalTokens;
      entry.latency.merge(r.latencySketch);
      entry.ttft.merge(r.ttftSketch);

      timeMap.set(ts, entry);
    }

    const series: TimeSeriesPoint[] = Array.from(timeMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([timestamp, entry]) => ({
        timestamp,
        requestsTotal: entry.reqTotal,
        requestsCompleted: entry.reqCompleted,
        requestsFailed: entry.reqFailed,
        inputTokens: entry.inputTokens.toString(),
        outputTokens: entry.outputTokens.toString(),
        totalTokens: entry.totalTokens.toString(),
        latencyP50Ms: entry.latency.percentile(50),
        latencyP95Ms: entry.latency.percentile(95),
        latencyP99Ms: entry.latency.percentile(99),
        ttftP95Ms: entry.ttft.percentile(95),
      }));

    return {
      range: {
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        granularity,
      },
      series,
    };
  }

  public async getModelBreakdown(params: {
    organizationId: string;
    workspaceId?: string;
    startTime: Date;
    endTime: Date;
    limit?: number;
  }): Promise<{ items: ModelBreakdownItem[] }> {
    const rollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      startTime: params.startTime,
      endTime: params.endTime,
      granularity: "day",
    });

    const modelMap = new Map<string, {
      reqCount: number;
      failedCount: number;
      inputTokens: bigint;
      outputTokens: bigint;
      totalTokens: bigint;
      latency: LatencyDistributionSketch;
    }>();

    for (const r of rollups) {
      const model = r.canonicalModelId ?? "unknown";
      const entry = modelMap.get(model) ?? {
        reqCount: 0,
        failedCount: 0,
        inputTokens: 0n,
        outputTokens: 0n,
        totalTokens: 0n,
        latency: new LatencyDistributionSketch(),
      };

      entry.reqCount += r.requestsTotal;
      entry.failedCount += r.requestsFailed;
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
      entry.totalTokens += r.totalTokens;
      entry.latency.merge(r.latencySketch);
      modelMap.set(model, entry);
    }

    const items: ModelBreakdownItem[] = Array.from(modelMap.entries())
      .map(([canonicalModelId, data]) => ({
        canonicalModelId,
        requestCount: data.reqCount,
        inputTokens: data.inputTokens.toString(),
        outputTokens: data.outputTokens.toString(),
        totalTokens: data.totalTokens.toString(),
        latencyP95Ms: data.latency.percentile(95),
        errorRate: data.reqCount > 0 ? Math.round((data.failedCount / data.reqCount) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, params.limit ?? 20);

    return { items };
  }

  public async getApiKeyBreakdown(params: {
    organizationId: string;
    workspaceId?: string;
    startTime: Date;
    endTime: Date;
    limit?: number;
  }): Promise<{ items: ApiKeyBreakdownItem[] }> {
    const rollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      startTime: params.startTime,
      endTime: params.endTime,
      granularity: "day",
    });

    const keyMap = new Map<string, { reqCount: number; totalTokens: bigint; lastUsed?: Date }>();

    for (const r of rollups) {
      const keyId = r.apiKeyId ?? "direct";
      const entry = keyMap.get(keyId) ?? { reqCount: 0, totalTokens: 0n };
      entry.reqCount += r.requestsTotal;
      entry.totalTokens += r.totalTokens;
      if (!entry.lastUsed || r.bucketEnd > entry.lastUsed) {
        entry.lastUsed = r.bucketEnd;
      }
      keyMap.set(keyId, entry);
    }

    const items: ApiKeyBreakdownItem[] = Array.from(keyMap.entries())
      .map(([apiKeyId, data]) => ({
        apiKeyId,
        maskedPrefix: maskApiKey(apiKeyId),
        name: `Key ${apiKeyId.slice(-6)}`,
        requestCount: data.reqCount,
        totalTokens: data.totalTokens.toString(),
        lastUsedAt: data.lastUsed?.toISOString(),
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, params.limit ?? 20);

    return { items };
  }

  public async getWorkspaceBreakdown(params: {
    organizationId: string;
    startTime: Date;
    endTime: Date;
  }): Promise<{ items: WorkspaceBreakdownItem[] }> {
    const rollups = await this.repository.queryRollups({
      organizationId: params.organizationId,
      startTime: params.startTime,
      endTime: params.endTime,
      granularity: "day",
    });

    const wsMap = new Map<string, { reqCount: number; failedCount: number; totalTokens: bigint }>();

    for (const r of rollups) {
      const ws = r.workspaceId;
      const entry = wsMap.get(ws) ?? { reqCount: 0, failedCount: 0, totalTokens: 0n };
      entry.reqCount += r.requestsTotal;
      entry.failedCount += r.requestsFailed;
      entry.totalTokens += r.totalTokens;
      wsMap.set(ws, entry);
    }

    const items: WorkspaceBreakdownItem[] = Array.from(wsMap.entries()).map(([workspaceId, data]) => ({
      workspaceId,
      requestCount: data.reqCount,
      totalTokens: data.totalTokens.toString(),
      errorRate: data.reqCount > 0 ? Math.round((data.failedCount / data.reqCount) * 10000) / 100 : 0,
    }));

    return { items };
  }

  public async getRequestDrilldown(params: {
    organizationId: string;
    workspaceId?: string;
    apiKeyId?: string;
    canonicalModelId?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<RequestDrilldownResponse> {
    const result = await this.repository.queryRequestRecords({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      status: params.status,
      limit: params.limit,
      cursor: params.cursor,
    });

    const items = result.records.map((r) => ({
      requestId: r.requestId,
      timestamp: r.startedAt.toISOString(),
      model: r.canonicalModelId,
      status: r.status,
      stream: r.streaming,
      latencyMs: r.durationMs ?? 0,
      ttftMs: r.ttftMs,
      tokens: {
        inputTokens: r.logicalUsage.inputTokens,
        outputTokens: r.logicalUsage.outputTokens,
        totalTokens: r.logicalUsage.totalTokens,
      },
      retryCount: r.retryCount,
      fallbackCount: r.fallbackCount,
      maskedApiKeyId: r.apiKeyId ? maskApiKey(r.apiKeyId) : "none",
    }));

    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: Boolean(result.nextCursor),
    };
  }

  public async getInternalProviderAnalytics(params: {
    startTime: Date;
    endTime: Date;
  }): Promise<{ providers: InternalProviderAnalyticsSummary[] }> {
    const rollups = await this.repository.queryRollups({
      startTime: params.startTime,
      endTime: params.endTime,
      granularity: "day",
    });

    const provMap = new Map<string, {
      attempts: number;
      completed: number;
      failed: number;
      err429: number;
      err5xx: number;
      timeouts: number;
      latency: LatencyDistributionSketch;
      ttft: LatencyDistributionSketch;
      provInput: bigint;
      provOutput: bigint;
      provTotal: bigint;
      fallbackFrom: number;
      fallbackTo: number;
    }>();

    for (const r of rollups) {
      const prov = r.providerId ?? "direct";
      const entry = provMap.get(prov) ?? {
        attempts: 0,
        completed: 0,
        failed: 0,
        err429: 0,
        err5xx: 0,
        timeouts: 0,
        latency: new LatencyDistributionSketch(),
        ttft: new LatencyDistributionSketch(),
        provInput: 0n,
        provOutput: 0n,
        provTotal: 0n,
        fallbackFrom: 0,
        fallbackTo: 0,
      };

      entry.attempts += r.providerAttempts;
      entry.completed += r.requestsCompleted;
      entry.failed += r.requestsFailed;
      entry.provInput += r.providerInputTokens;
      entry.provOutput += r.providerOutputTokens;
      entry.provTotal += r.providerTotalTokens;
      entry.latency.merge(r.latencySketch);
      entry.ttft.merge(r.ttftSketch);

      for (const [err, cnt] of Object.entries(r.errorCounts)) {
        if (err.includes("429") || err.includes("rate_limit")) entry.err429 += cnt;
        else if (err.includes("timeout")) entry.timeouts += cnt;
        else if (err.includes("5") || err.includes("server_error")) entry.err5xx += cnt;
      }

      if (r.fallbackAttempts > 0) {
        entry.fallbackTo += r.fallbackAttempts;
      }

      provMap.set(prov, entry);
    }

    const providers: InternalProviderAnalyticsSummary[] = Array.from(provMap.entries()).map(([providerId, data]) => ({
      providerId,
      displayName: providerId.toUpperCase(),
      attemptCount: data.attempts,
      successfulAttempts: data.completed,
      failedAttempts: data.failed,
      errorRate: data.attempts > 0 ? Math.round((data.failed / data.attempts) * 10000) / 100 : 0,
      rateLimit429Count: data.err429,
      serverError5xxCount: data.err5xx,
      timeoutCount: data.timeouts,
      latencyP50Ms: data.latency.percentile(50),
      latencyP95Ms: data.latency.percentile(95),
      ttftP95Ms: data.ttft.percentile(95),
      providerTokens: {
        inputTokens: data.provInput.toString(),
        outputTokens: data.provOutput.toString(),
        totalTokens: data.provTotal.toString(),
      },
      fallbackFromCount: data.fallbackFrom,
      fallbackToCount: data.fallbackTo,
    }));

    return { providers };
  }

  public async getInternalReliabilityAnalytics(params: {
    startTime: Date;
    endTime: Date;
  }): Promise<InternalReliabilityAnalyticsSummary> {
    const rollups = await this.repository.queryRollups({
      startTime: params.startTime,
      endTime: params.endTime,
      granularity: "day",
    });

    let totalRequests = 0;
    let totalAttempts = 0;
    let retriedRequests = 0;
    let fallbackRequests = 0;
    let logicalTokens = 0n;
    let providerTokens = 0n;

    for (const r of rollups) {
      totalRequests += r.requestsTotal;
      totalAttempts += r.providerAttempts;
      retriedRequests += r.retryAttempts;
      fallbackRequests += r.fallbackAttempts;
      logicalTokens += r.totalTokens;
      providerTokens += r.providerTotalTokens;
    }

    const firstAttemptSuccess = Math.max(0, totalRequests - retriedRequests - fallbackRequests);
    const recoveryCount = retriedRequests + fallbackRequests;
    const recoveryRate = (retriedRequests + fallbackRequests) > 0 ? 1.0 : 0;
    const retryAmplificationAttempts = totalRequests > 0 ? Math.round((totalAttempts / totalRequests) * 100) / 100 : 1;
    const retryAmplificationTokens = logicalTokens > 0n ? Number((providerTokens * 100n) / logicalTokens) / 100 : 1;

    return {
      totalRequests,
      totalAttempts,
      firstAttemptSuccessCount: firstAttemptSuccess,
      retriedRequestsCount: retriedRequests,
      fallbackRequestsCount: fallbackRequests,
      recoveryCount,
      recoveryRate,
      retryAmplificationAttempts,
      retryAmplificationTokens,
      circuitsOpenedCount: 0,
      preventedCallsCount: 0,
    };
  }
}
