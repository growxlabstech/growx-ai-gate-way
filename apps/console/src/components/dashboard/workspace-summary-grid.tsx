import Link from "next/link";
import type {
  WorkspaceOverviewMetricSummary,
  WorkspaceFinancialSummary,
} from "../../lib/overview-data";

export function WorkspaceSummaryGrid({
  metrics,
  financials,
  organizationSlug,
  workspaceSlug,
}: {
  metrics: WorkspaceOverviewMetricSummary;
  financials: WorkspaceFinancialSummary;
  organizationSlug: string;
  workspaceSlug: string;
}) {
  const base = `/${organizationSlug}/${workspaceSlug}`;
  const hasRequests = metrics.totalRequests > 0;

  return (
    <section
      className="overview-summary-grid"
      aria-label="Executive Workspace Summary"
    >
      {/* 1. Total Requests */}
      <article className="overview-metric-card">
        <header className="metric-header">
          <span className="metric-label">Total requests</span>
          {hasRequests ? (
            <span
              className={`metric-badge ${metrics.successRate >= 99 ? "health" : metrics.successRate >= 95 ? "warning" : "critical"}`}
            >
              {metrics.successRate.toFixed(1)}% success
            </span>
          ) : (
            <span className="metric-badge neutral">No traffic</span>
          )}
        </header>
        <div className="metric-value-row">
          <strong className="metric-primary-value">
            {metrics.totalRequests.toLocaleString()}
          </strong>
        </div>
        <footer className="metric-subtext">
          {hasRequests ? (
            <span>
              <strong>{metrics.completedRequests.toLocaleString()}</strong>{" "}
              completed ·{" "}
              <span className={metrics.failedRequests > 0 ? "text-danger" : ""}>
                {metrics.failedRequests} failed
              </span>
            </span>
          ) : (
            <span className="muted">Past 24 hours</span>
          )}
        </footer>
      </article>

      {/* 2. Total Tokens / Usage */}
      <article className="overview-metric-card">
        <header className="metric-header">
          <span className="metric-label">Token throughput</span>
          <Link
            href={`${base}/usage`}
            className="metric-action-link"
            aria-label="View detailed usage breakdown"
          >
            Details
          </Link>
        </header>
        <div className="metric-value-row">
          <strong className="metric-primary-value">
            {hasRequests
              ? parseInt(metrics.totalTokens, 10) >= 1_000_000
                ? `${(parseInt(metrics.totalTokens, 10) / 1_000_000).toFixed(2)}M`
                : parseInt(metrics.totalTokens, 10) >= 1_000
                  ? `${(parseInt(metrics.totalTokens, 10) / 1_000).toFixed(1)}k`
                  : metrics.totalTokens
              : "0"}
          </strong>
          <span className="metric-unit">tokens</span>
        </div>
        <footer className="metric-subtext">
          {hasRequests ? (
            <span>
              {parseInt(metrics.inputTokens, 10).toLocaleString()} in ·{" "}
              {parseInt(metrics.outputTokens, 10).toLocaleString()} out
            </span>
          ) : (
            <span className="muted">Input & output tokens</span>
          )}
        </footer>
      </article>

      {/* 3. Spend & Credits Balance */}
      <article className="overview-metric-card">
        <header className="metric-header">
          <span className="metric-label">Credits balance</span>
          <Link
            href={`${base}/billing`}
            className="metric-action-link"
            aria-label="Manage credits and billing"
          >
            Billing
          </Link>
        </header>
        <div className="metric-value-row">
          <strong className="metric-primary-value">
            {financials.availableBalanceFormatted}
          </strong>
          <span className="metric-badge health">{financials.walletStatus}</span>
        </div>
        <footer className="metric-subtext">
          <span>
            Spend today: <strong>{financials.totalSpendFormatted}</strong>
          </span>
        </footer>
      </article>

      {/* 4. Request Latency */}
      <article className="overview-metric-card">
        <header className="metric-header">
          <span className="metric-label">p95 Latency</span>
          <span className="metric-sub-label">p50 / TTFT</span>
        </header>
        <div className="metric-value-row">
          <strong className="metric-primary-value">
            {hasRequests ? `${metrics.p95LatencyMs}` : "—"}
          </strong>
          {hasRequests && <span className="metric-unit">ms</span>}
        </div>
        <footer className="metric-subtext">
          {hasRequests ? (
            <span>
              p50: <strong>{metrics.p50LatencyMs}ms</strong> · TTFT:{" "}
              <strong>{metrics.ttftMs}ms</strong>
            </span>
          ) : (
            <span className="muted">Measured at gateway edge</span>
          )}
        </footer>
      </article>

      {/* 5. Active API Keys */}
      <article className="overview-metric-card">
        <header className="metric-header">
          <span className="metric-label">API keys</span>
          <Link
            href={`${base}/api-keys`}
            className="metric-action-link"
            aria-label="Manage API keys"
          >
            Manage
          </Link>
        </header>
        <div className="metric-value-row">
          <strong className="metric-primary-value">
            {metrics.activeKeysCount}
          </strong>
          <span className="metric-unit">active</span>
        </div>
        <footer className="metric-subtext">
          <span className="muted">Workspace credentials</span>
        </footer>
      </article>
    </section>
  );
}
