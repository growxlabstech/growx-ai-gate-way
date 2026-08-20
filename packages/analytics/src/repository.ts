import { createPublicId } from "@growx/ids";
import type {
  AnalyticsRollupRecord,
  AnomalySignal,
  AnalyticsFilter,
  AnalyticsTimeRange,
} from "./types.js";
import { LatencyDistributionSketch } from "./distribution.js";
import type { GatewayRequestRecord, GatewayAttemptRecord, UsageEvent } from "@growx/metering";

export interface AnalyticsCheckpointRecord {
  id: string;
  projectorName: string;
  lastProcessedEventId: string | null;
  lastProcessedTimestamp: Date | null;
  processedEventsCount: bigint;
  updatedAt: Date;
}

export interface RollupQueryOptions {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  apiKeyId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerId?: string | undefined;
  startTime: Date;
  endTime: Date;
  granularity: "minute" | "hour" | "day";
}

export interface RequestDrilldownQueryOptions {
  organizationId: string;
  workspaceId?: string | undefined;
  apiKeyId?: string | undefined;
  canonicalModelId?: string | undefined;
  status?: string | undefined;
  startTime?: Date | undefined;
  endTime?: Date | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface AnalyticsRepository {
  saveRollup(record: AnalyticsRollupRecord): Promise<void>;
  queryRollups(options: RollupQueryOptions): Promise<AnalyticsRollupRecord[]>;
  getCheckpoint(projectorName: string): Promise<AnalyticsCheckpointRecord | null>;
  saveCheckpoint(checkpoint: AnalyticsCheckpointRecord): Promise<void>;
  saveAnomaly(anomaly: AnomalySignal): Promise<void>;
  queryAnomalies(options: { organizationId?: string; providerId?: string; limit?: number }): Promise<AnomalySignal[]>;
  saveRequestRecord(record: GatewayRequestRecord): Promise<void>;
  getRequestRecord(requestId: string): Promise<GatewayRequestRecord | null>;
  queryRequestRecords(options: RequestDrilldownQueryOptions): Promise<{ records: GatewayRequestRecord[]; nextCursor?: string | undefined }>;
  saveAttemptRecord(record: GatewayAttemptRecord): Promise<void>;
  listAttemptsForRequest(requestId: string): Promise<GatewayAttemptRecord[]>;
  saveUsageEvent(event: UsageEvent): Promise<void>;
  listUsageEventsForRequest(requestId: string): Promise<UsageEvent[]>;
  getAllUsageEvents(): Promise<UsageEvent[]>;
  getAllRequestRecords(): Promise<GatewayRequestRecord[]>;
  getAllAttemptRecords(): Promise<GatewayAttemptRecord[]>;
  clearAllRollups(): Promise<void>;
}

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  private rollups: Map<string, AnalyticsRollupRecord> = new Map();
  private checkpoints: Map<string, AnalyticsCheckpointRecord> = new Map();
  private anomalies: Map<string, AnomalySignal> = new Map();
  private requests: Map<string, GatewayRequestRecord> = new Map();
  private attempts: Map<string, GatewayAttemptRecord> = new Map();
  private usageEvents: Map<string, UsageEvent> = new Map();

  private makeRollupKey(r: {
    bucket: string;
    bucketStart: Date;
    organizationId: string;
    workspaceId: string;
    apiKeyId?: string | null | undefined;
    canonicalModelId?: string | null | undefined;
    providerId?: string | null | undefined;
    routeId?: string | null | undefined;
  }): string {
    return `${r.bucket}:${r.bucketStart.toISOString()}:${r.organizationId}:${r.workspaceId}:${r.apiKeyId ?? ""}:${r.canonicalModelId ?? ""}:${r.providerId ?? ""}:${r.routeId ?? ""}`;
  }

  public async saveRollup(record: AnalyticsRollupRecord): Promise<void> {
    const key = this.makeRollupKey(record);
    const existing = this.rollups.get(key);
    if (!existing) {
      this.rollups.set(key, { ...record });
      return;
    }

    // Atomic merge of distributions and counters
    const mergedLatency = new LatencyDistributionSketch(existing.latencySketch).merge(record.latencySketch);
    const mergedTtft = new LatencyDistributionSketch(existing.ttftSketch).merge(record.ttftSketch);

    const mergedErrors = { ...existing.errorCounts };
    for (const [err, cnt] of Object.entries(record.errorCounts)) {
      mergedErrors[err] = (mergedErrors[err] ?? 0) + cnt;
    }

    const mergedPolicy = { ...existing.policyDenialCounts };
    for (const [pol, cnt] of Object.entries(record.policyDenialCounts)) {
      mergedPolicy[pol] = (mergedPolicy[pol] ?? 0) + cnt;
    }

    const mergedQuota = { ...existing.quotaDenialCounts };
    for (const [q, cnt] of Object.entries(record.quotaDenialCounts)) {
      mergedQuota[q] = (mergedQuota[q] ?? 0) + cnt;
    }

    this.rollups.set(key, {
      ...existing,
      requestsTotal: existing.requestsTotal + record.requestsTotal,
      requestsCompleted: existing.requestsCompleted + record.requestsCompleted,
      requestsFailed: existing.requestsFailed + record.requestsFailed,
      requestsCancelled: existing.requestsCancelled + record.requestsCancelled,
      requestsRejected: existing.requestsRejected + record.requestsRejected,
      providerAttempts: existing.providerAttempts + record.providerAttempts,
      retryAttempts: existing.retryAttempts + record.retryAttempts,
      fallbackAttempts: existing.fallbackAttempts + record.fallbackAttempts,
      streamRequests: existing.streamRequests + record.streamRequests,
      inputTokens: existing.inputTokens + record.inputTokens,
      outputTokens: existing.outputTokens + record.outputTokens,
      totalTokens: existing.totalTokens + record.totalTokens,
      cachedInputTokens: existing.cachedInputTokens + record.cachedInputTokens,
      reasoningTokens: existing.reasoningTokens + record.reasoningTokens,
      providerInputTokens: existing.providerInputTokens + record.providerInputTokens,
      providerOutputTokens: existing.providerOutputTokens + record.providerOutputTokens,
      providerTotalTokens: existing.providerTotalTokens + record.providerTotalTokens,
      latencySketch: mergedLatency.toJSON(),
      ttftSketch: mergedTtft.toJSON(),
      errorCounts: mergedErrors,
      policyDenialCounts: mergedPolicy,
      quotaDenialCounts: mergedQuota,
      updatedAt: new Date(),
    });
  }

  public async queryRollups(options: RollupQueryOptions): Promise<AnalyticsRollupRecord[]> {
    return Array.from(this.rollups.values()).filter((r) => {
      if (r.bucket !== options.granularity) return false;
      if (options.organizationId && r.organizationId !== options.organizationId) return false;
      if (options.workspaceId && r.workspaceId !== options.workspaceId) return false;
      if (options.apiKeyId && r.apiKeyId !== options.apiKeyId) return false;
      if (options.canonicalModelId && r.canonicalModelId !== options.canonicalModelId) return false;
      if (options.providerId && r.providerId !== options.providerId) return false;
      if (r.bucketEnd < options.startTime) return false;
      if (r.bucketStart > options.endTime) return false;
      return true;
    }).sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
  }

  public async getCheckpoint(projectorName: string): Promise<AnalyticsCheckpointRecord | null> {
    return this.checkpoints.get(projectorName) ?? null;
  }

  public async saveCheckpoint(checkpoint: AnalyticsCheckpointRecord): Promise<void> {
    this.checkpoints.set(checkpoint.projectorName, { ...checkpoint });
  }

  public async saveAnomaly(anomaly: AnomalySignal): Promise<void> {
    this.anomalies.set(anomaly.id, { ...anomaly });
  }

  public async queryAnomalies(options: { organizationId?: string; providerId?: string; limit?: number }): Promise<AnomalySignal[]> {
    return Array.from(this.anomalies.values())
      .filter((a) => {
        if (options.organizationId && a.organizationId && a.organizationId !== options.organizationId) return false;
        if (options.providerId && a.providerId && a.providerId !== options.providerId) return false;
        return true;
      })
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, options.limit ?? 50);
  }

  public async saveRequestRecord(record: GatewayRequestRecord): Promise<void> {
    this.requests.set(record.requestId, { ...record });
  }

  public async getRequestRecord(requestId: string): Promise<GatewayRequestRecord | null> {
    return this.requests.get(requestId) ?? null;
  }

  public async queryRequestRecords(options: RequestDrilldownQueryOptions): Promise<{ records: GatewayRequestRecord[]; nextCursor?: string }> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    let matched = Array.from(this.requests.values()).filter((r) => {
      if (r.organizationId !== options.organizationId) return false;
      if (options.workspaceId && r.workspaceId !== options.workspaceId) return false;
      if (options.apiKeyId && r.apiKeyId !== options.apiKeyId) return false;
      if (options.canonicalModelId && r.canonicalModelId !== options.canonicalModelId) return false;
      if (options.status && r.status !== options.status) return false;
      if (options.startTime && r.startedAt < options.startTime) return false;
      if (options.endTime && r.startedAt > options.endTime) return false;
      return true;
    }).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    if (options.cursor) {
      const idx = matched.findIndex((r) => r.requestId === options.cursor);
      if (idx >= 0) {
        matched = matched.slice(idx + 1);
      }
    }

    const records = matched.slice(0, limit);
    const hasMore = matched.length > limit;
    const lastReq = records[records.length - 1];
    const nextCursor = hasMore && lastReq ? lastReq.requestId : undefined;

    return nextCursor ? { records, nextCursor } : { records };
  }

  public async saveAttemptRecord(record: GatewayAttemptRecord): Promise<void> {
    this.attempts.set(record.id, { ...record });
  }

  public async listAttemptsForRequest(requestId: string): Promise<GatewayAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.requestId === requestId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  public async saveUsageEvent(event: UsageEvent): Promise<void> {
    this.usageEvents.set(event.id, { ...event });
  }

  public async listUsageEventsForRequest(requestId: string): Promise<UsageEvent[]> {
    return Array.from(this.usageEvents.values()).filter((e) => e.requestId === requestId);
  }

  public async getAllUsageEvents(): Promise<UsageEvent[]> {
    return Array.from(this.usageEvents.values());
  }

  public async getAllRequestRecords(): Promise<GatewayRequestRecord[]> {
    return Array.from(this.requests.values());
  }

  public async getAllAttemptRecords(): Promise<GatewayAttemptRecord[]> {
    return Array.from(this.attempts.values());
  }

  public async clearAllRollups(): Promise<void> {
    this.rollups.clear();
  }
}
