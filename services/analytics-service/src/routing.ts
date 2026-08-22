export interface RoutingAnalyticsQuery {
  organizationId: string;
  workspaceId: string;
  from: Date;
  to: Date;
}
export interface RoutingAnalytics {
  requests: number;
  fallbackRate: number;
  cacheHitRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  providerDistribution: Readonly<Record<string, number>>;
  modelDistribution: Readonly<Record<string, number>>;
}
export interface RoutingAnalyticsStore {
  query(input: RoutingAnalyticsQuery): Promise<RoutingAnalytics>;
}
export class RoutingAnalyticsService {
  constructor(private readonly store: RoutingAnalyticsStore) {}
  get(input: RoutingAnalyticsQuery) {
    if (input.to <= input.from) throw new Error("Invalid analytics interval");
    return this.store.query(input);
  }
}
export interface ClickHouseEventSink {
  insert(
    table:
      | "gateway_events"
      | "routing_events"
      | "provider_attempt_events"
      | "provider_health_events"
      | "fallback_events"
      | "cache_events"
      | "latency_events"
      | "token_events",
    event: Record<string, unknown>,
  ): Promise<void>;
}
