import { createPublicId } from "@growx/ids";
import type {
  AnalyticsRepository,
  AnalyticsCheckpointRecord,
} from "./repository.js";
import type { AnalyticsRollupRecord } from "./types.js";
import { LatencyDistributionSketch } from "./distribution.js";
import type {
  GatewayRequestRecord,
  GatewayAttemptRecord,
  UsageEvent,
} from "@growx/metering";

export function getBucketBoundaries(
  date: Date,
  granularity: "minute" | "hour" | "day",
): { bucketStart: Date; bucketEnd: Date } {
  const d = new Date(date.getTime());
  if (granularity === "minute") {
    d.setUTCSeconds(0, 0);
    const start = new Date(d.getTime());
    const end = new Date(start.getTime() + 60 * 1000 - 1);
    return { bucketStart: start, bucketEnd: end };
  }
  if (granularity === "hour") {
    d.setUTCMinutes(0, 0, 0);
    const start = new Date(d.getTime());
    const end = new Date(start.getTime() + 60 * 60 * 1000 - 1);
    return { bucketStart: start, bucketEnd: end };
  }
  // day
  d.setUTCHours(0, 0, 0, 0);
  const start = new Date(d.getTime());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { bucketStart: start, bucketEnd: end };
}

export class AnalyticsProjectionEngine {
  constructor(private readonly repository: AnalyticsRepository) {}

  public async projectRequest(
    request: GatewayRequestRecord,
    attempts: GatewayAttemptRecord[] = [],
    events: UsageEvent[] = [],
  ): Promise<void> {
    // 1. Save raw drilldown records
    await this.repository.saveRequestRecord(request);
    for (const att of attempts) {
      await this.repository.saveAttemptRecord(att);
    }
    for (const evt of events) {
      await this.repository.saveUsageEvent(evt);
    }

    // 2. Project into both Hourly and Daily rollups
    const timestamp = request.completedAt ?? request.startedAt;
    const hourly = getBucketBoundaries(timestamp, "hour");
    const daily = getBucketBoundaries(timestamp, "day");

    const primaryAttempt = attempts[0];
    const winningAttempt =
      attempts.find((a) => a.status === "completed") ??
      attempts[attempts.length - 1];

    const providerId =
      winningAttempt?.providerId ?? primaryAttempt?.providerId ?? null;
    const latencySketch = new LatencyDistributionSketch();
    if (request.durationMs !== undefined && request.durationMs > 0) {
      latencySketch.record(request.durationMs);
    }

    const ttftSketch = new LatencyDistributionSketch();
    if (request.ttftMs !== undefined && request.ttftMs > 0) {
      ttftSketch.record(request.ttftMs);
    }

    const errorCounts: Record<string, number> = {};
    if (request.errorCode) {
      errorCounts[request.errorCode] = 1;
    }

    const buildRollup = (
      bucket: "hour" | "day",
      bounds: { bucketStart: Date; bucketEnd: Date },
    ): AnalyticsRollupRecord => ({
      id: createPublicId("anl"),
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      apiKeyId: request.apiKeyId,
      canonicalModelId: request.canonicalModelId,
      providerId,
      routeId: winningAttempt?.providerModelId ?? null,
      bucket,
      bucketStart: bounds.bucketStart,
      bucketEnd: bounds.bucketEnd,
      requestsTotal: 1,
      requestsCompleted: request.status === "completed" ? 1 : 0,
      requestsFailed: request.status === "failed" ? 1 : 0,
      requestsCancelled: request.status === "cancelled" ? 1 : 0,
      requestsRejected: request.status === "rejected" ? 1 : 0,
      providerAttempts: request.attemptCount,
      retryAttempts: request.retryCount,
      fallbackAttempts: request.fallbackCount,
      streamRequests: request.streaming ? 1 : 0,
      inputTokens: BigInt(request.logicalUsage.inputTokens),
      outputTokens: BigInt(request.logicalUsage.outputTokens),
      totalTokens: BigInt(request.logicalUsage.totalTokens),
      cachedInputTokens: BigInt(request.logicalUsage.cachedInputTokens ?? 0),
      reasoningTokens: BigInt(request.logicalUsage.reasoningTokens ?? 0),
      providerInputTokens: BigInt(request.providerConsumption.inputTokens),
      providerOutputTokens: BigInt(request.providerConsumption.outputTokens),
      providerTotalTokens: BigInt(request.providerConsumption.totalTokens),
      latencySketch: latencySketch.toJSON(),
      ttftSketch: ttftSketch.toJSON(),
      errorCounts,
      policyDenialCounts: {},
      quotaDenialCounts: {},
      updatedAt: new Date(),
    });

    await this.repository.saveRollup(buildRollup("hour", hourly));
    await this.repository.saveRollup(buildRollup("day", daily));
  }

  public async projectPolicyDenial(params: {
    organizationId: string;
    workspaceId: string;
    apiKeyId?: string;
    canonicalModelId?: string;
    reason: string;
    timestamp?: Date;
  }): Promise<void> {
    const timestamp = params.timestamp ?? new Date();
    const hourly = getBucketBoundaries(timestamp, "hour");
    const daily = getBucketBoundaries(timestamp, "day");

    const policyDenialCounts: Record<string, number> = { [params.reason]: 1 };

    const buildRollup = (
      bucket: "hour" | "day",
      bounds: { bucketStart: Date; bucketEnd: Date },
    ): AnalyticsRollupRecord => ({
      id: createPublicId("anl"),
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      bucket,
      bucketStart: bounds.bucketStart,
      bucketEnd: bounds.bucketEnd,
      requestsTotal: 1,
      requestsCompleted: 0,
      requestsFailed: 0,
      requestsCancelled: 0,
      requestsRejected: 1,
      providerAttempts: 0,
      retryAttempts: 0,
      fallbackAttempts: 0,
      streamRequests: 0,
      inputTokens: 0n,
      outputTokens: 0n,
      totalTokens: 0n,
      cachedInputTokens: 0n,
      reasoningTokens: 0n,
      providerInputTokens: 0n,
      providerOutputTokens: 0n,
      providerTotalTokens: 0n,
      latencySketch: new LatencyDistributionSketch().toJSON(),
      ttftSketch: new LatencyDistributionSketch().toJSON(),
      errorCounts: {},
      policyDenialCounts,
      quotaDenialCounts: {},
      updatedAt: new Date(),
    });

    await this.repository.saveRollup(buildRollup("hour", hourly));
    await this.repository.saveRollup(buildRollup("day", daily));
  }

  public async projectQuotaDenial(params: {
    organizationId: string;
    workspaceId: string;
    apiKeyId?: string;
    canonicalModelId?: string;
    reason: string;
    timestamp?: Date;
  }): Promise<void> {
    const timestamp = params.timestamp ?? new Date();
    const hourly = getBucketBoundaries(timestamp, "hour");
    const daily = getBucketBoundaries(timestamp, "day");

    const quotaDenialCounts: Record<string, number> = { [params.reason]: 1 };

    const buildRollup = (
      bucket: "hour" | "day",
      bounds: { bucketStart: Date; bucketEnd: Date },
    ): AnalyticsRollupRecord => ({
      id: createPublicId("anl"),
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      bucket,
      bucketStart: bounds.bucketStart,
      bucketEnd: bounds.bucketEnd,
      requestsTotal: 1,
      requestsCompleted: 0,
      requestsFailed: 0,
      requestsCancelled: 0,
      requestsRejected: 1,
      providerAttempts: 0,
      retryAttempts: 0,
      fallbackAttempts: 0,
      streamRequests: 0,
      inputTokens: 0n,
      outputTokens: 0n,
      totalTokens: 0n,
      cachedInputTokens: 0n,
      reasoningTokens: 0n,
      providerInputTokens: 0n,
      providerOutputTokens: 0n,
      providerTotalTokens: 0n,
      latencySketch: new LatencyDistributionSketch().toJSON(),
      ttftSketch: new LatencyDistributionSketch().toJSON(),
      errorCounts: {},
      policyDenialCounts: {},
      quotaDenialCounts,
      updatedAt: new Date(),
    });

    await this.repository.saveRollup(buildRollup("hour", hourly));
    await this.repository.saveRollup(buildRollup("day", daily));
  }
}
