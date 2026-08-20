import type { LatencySketchData } from "./distribution.js";

export type AnalyticsTimeGranularity = "minute" | "hour" | "day" | "month" | "auto";

export interface AnalyticsTimeRange {
  startTime: Date;
  endTime: Date;
  granularity?: AnalyticsTimeGranularity | undefined;
}

export interface AnalyticsFilter {
  organizationId: string;
  workspaceId?: string | undefined;
  apiKeyId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerId?: string | undefined;
  routeId?: string | undefined;
  status?: string | undefined;
}

export interface AnalyticsRollupRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | null | undefined;
  canonicalModelId?: string | null | undefined;
  providerId?: string | null | undefined;
  routeId?: string | null | undefined;
  bucket: "minute" | "hour" | "day";
  bucketStart: Date;
  bucketEnd: Date;
  requestsTotal: number;
  requestsCompleted: number;
  requestsFailed: number;
  requestsCancelled: number;
  requestsRejected: number;
  providerAttempts: number;
  retryAttempts: number;
  fallbackAttempts: number;
  streamRequests: number;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  cachedInputTokens: bigint;
  reasoningTokens: bigint;
  providerInputTokens: bigint;
  providerOutputTokens: bigint;
  providerTotalTokens: bigint;
  latencySketch: LatencySketchData;
  ttftSketch: LatencySketchData;
  errorCounts: Record<string, number>;
  policyDenialCounts: Record<string, number>;
  quotaDenialCounts: Record<string, number>;
  updatedAt: Date;
}

export interface CustomerUsageSummary {
  range: {
    startTime: string;
    endTime: string;
    granularity: string;
  };
  requests: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    rejected: number;
    successRate: number;
    errorRate: number;
  };
  tokens: {
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    cachedInputTokens: string;
    reasoningTokens: string;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    meanMs: number;
  };
  ttft: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  resilience: {
    retriedRequests: number;
    fallbackRequests: number;
    retryRate: number;
    fallbackRate: number;
  };
  streaming: {
    streamRequests: number;
  };
  topModels: Array<{
    modelId: string;
    requestCount: number;
    totalTokens: string;
    sharePercentage: number;
  }>;
  dataFreshness: {
    lastProjectedAt: string;
    lagSeconds: number;
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  requestsTotal: number;
  requestsCompleted: number;
  requestsFailed: number;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  ttftP95Ms: number;
}

export interface CustomerTimeSeriesResponse {
  range: { startTime: string; endTime: string; granularity: string };
  series: TimeSeriesPoint[];
}

export interface ModelBreakdownItem {
  canonicalModelId: string;
  requestCount: number;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
  latencyP95Ms: number;
  errorRate: number;
}

export interface ApiKeyBreakdownItem {
  apiKeyId: string;
  maskedPrefix: string;
  name: string;
  requestCount: number;
  totalTokens: string;
  lastUsedAt?: string | undefined;
}

export interface WorkspaceBreakdownItem {
  workspaceId: string;
  requestCount: number;
  totalTokens: string;
  errorRate: number;
}

export interface RequestDrilldownItem {
  requestId: string;
  timestamp: string;
  model: string;
  status: string;
  stream: boolean;
  latencyMs: number;
  ttftMs?: number | undefined;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  retryCount: number;
  fallbackCount: number;
  maskedApiKeyId: string;
}

export interface RequestDrilldownResponse {
  items: RequestDrilldownItem[];
  nextCursor?: string | undefined;
  hasMore: boolean;
}

export interface InternalProviderAnalyticsSummary {
  providerId: string;
  displayName: string;
  attemptCount: number;
  successfulAttempts: number;
  failedAttempts: number;
  errorRate: number;
  rateLimit429Count: number;
  serverError5xxCount: number;
  timeoutCount: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  ttftP95Ms: number;
  providerTokens: {
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
  };
  fallbackFromCount: number;
  fallbackToCount: number;
}

export interface InternalReliabilityAnalyticsSummary {
  totalRequests: number;
  totalAttempts: number;
  firstAttemptSuccessCount: number;
  retriedRequestsCount: number;
  fallbackRequestsCount: number;
  recoveryCount: number;
  recoveryRate: number;
  retryAmplificationAttempts: number;
  retryAmplificationTokens: number;
  circuitsOpenedCount: number;
  preventedCallsCount: number;
}

export interface AnomalySignal {
  id: string;
  anomalyType:
    | "PROVIDER_ERROR_SPIKE"
    | "LATENCY_SPIKE"
    | "FALLBACK_SPIKE"
    | "QUOTA_SATURATION"
    | "CIRCUIT_OPEN_SPIKE"
    | "METERING_INCOMPLETE_SPIKE";
  severity: "info" | "warning" | "critical";
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  providerId?: string | undefined;
  canonicalModelId?: string | undefined;
  observedValue: number;
  baselineValue: number;
  threshold: number;
  details: Record<string, unknown>;
  detectedAt: Date;
  resolvedAt?: Date | undefined;
}
