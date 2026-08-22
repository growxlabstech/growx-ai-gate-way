import { AppShell } from "../../../../../components/app-shell";
import { loadTenantContext } from "../../../../../lib/load-tenant-context";
import {
  loadWorkspaceModelBreakdown,
  loadWorkspaceUsageAnalytics,
} from "../../../../../lib/analytics-data";

interface RoutingAnalyticsPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function RoutingAnalyticsPage({
  params,
}: RoutingAnalyticsPageProps) {
  const { organizationSlug, workspaceSlug } = await params;

  const contextResult = await loadTenantContext();

  const organization =
    contextResult.status === "ready"
      ? contextResult.context.organizations.find(
          (o) => o.organizationSlug === organizationSlug,
        )
      : undefined;

  const workspace =
    contextResult.status === "ready"
      ? contextResult.context.workspaces.find(
          (w) =>
            w.workspaceSlug === workspaceSlug &&
            (!organization || w.organizationId === organization.organizationId),
        )
      : undefined;

  const workspaceId = workspace?.workspaceId ?? "ws_production";
  const organizationId = organization?.organizationId ?? "org_northstar";

  const [summary, models] = await Promise.all([
    loadWorkspaceUsageAnalytics({
      organizationId,
      workspaceId,
      timeRange: "24h",
    }),
    loadWorkspaceModelBreakdown({
      organizationId,
      workspaceId,
      timeRange: "24h",
    }),
  ]);

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Routing Analytics"
      description="Customer-safe model distribution, latency percentiles, dynamic fallback rate, and cache hit metrics."
    >
      <div
        className="analytics-routing-container"
        data-testid="routing-analytics-root"
      >
        {/* Metric Summary Grid */}
        <div className="metric-cards-grid">
          <div className="analytics-metric-card">
            <span className="metric-card-label">Total Routed Requests</span>
            <div className="metric-card-value-row">
              <span className="metric-card-number">
                {summary.requests.total.toLocaleString()}
              </span>
              <span className="badge-success">
                {summary.requests.successRate}% Succeeded
              </span>
            </div>
            <span className="metric-card-sub">
              All models active under active workspace routing policy
            </span>
          </div>

          <div className="analytics-metric-card">
            <span className="metric-card-label">P95 Latency</span>
            <div className="metric-card-value-row">
              <span className="metric-card-number">
                {summary.latency.p95Ms}ms
              </span>
              <span className="metric-ttft-tag">
                TTFT {summary.ttft.p50Ms}ms
              </span>
            </div>
            <span className="metric-card-sub">
              P50: {summary.latency.p50Ms}ms · P99: {summary.latency.p99Ms}ms
            </span>
          </div>

          <div className="analytics-metric-card">
            <span className="metric-card-label">Fallback & Resilience</span>
            <div className="metric-card-value-row">
              <span className="metric-card-number">
                {summary.resilience.fallbackRate}%
              </span>
              <span className="badge-subtle">
                {summary.resilience.fallbackRequests} Fallbacks
              </span>
            </div>
            <span className="metric-card-sub">
              {summary.resilience.retriedRequests} Retried requests (
              {summary.resilience.retryRate}% rate)
            </span>
          </div>

          <div className="analytics-metric-card">
            <span className="metric-card-label">Cache Hit Rate</span>
            <div className="metric-card-value-row">
              <span className="metric-card-number text-accent-cool">
                {summary.cache.hitRate}%
              </span>
              <span className="badge-success">
                {summary.cache.exactHitCount + summary.cache.semanticHitCount}{" "}
                Hits
              </span>
            </div>
            <span className="metric-card-sub">
              {summary.cache.exactHitCount} Exact ·{" "}
              {summary.cache.semanticHitCount} Semantic
            </span>
          </div>
        </div>

        {/* Model Route Distribution Table */}
        <div className="breakdown-section-wrap" style={{ marginTop: "24px" }}>
          <h3 className="section-title">Model Traffic Distribution</h3>
          <div className="breakdown-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Target Model</th>
                  <th>Family</th>
                  <th className="num-col">Routed Requests</th>
                  <th className="num-col">Traffic Share</th>
                  <th className="num-col">P95 Latency</th>
                  <th className="num-col">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.modelId}>
                    <td>
                      <div className="model-cell">
                        <span className="model-name-text">{m.displayName}</span>
                        <span className="model-canonical-id">{m.modelId}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge-subtle">{m.family}</span>
                    </td>
                    <td className="num-col">{m.requests.toLocaleString()}</td>
                    <td className="num-col font-bold">{m.sharePercentage}%</td>
                    <td className="num-col">{m.p95LatencyMs}ms</td>
                    <td className="num-col">
                      <span
                        className={
                          m.successRate >= 99
                            ? "text-accent-success"
                            : "text-accent-warning"
                        }
                      >
                        {m.successRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
