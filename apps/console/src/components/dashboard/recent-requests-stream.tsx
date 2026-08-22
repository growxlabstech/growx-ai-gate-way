import Link from "next/link";
import type { OverviewRecentRequestItem } from "../../lib/overview-data";

export function RecentRequestsStream({
  requests,
  organizationSlug,
  workspaceSlug,
}: {
  requests: OverviewRecentRequestItem[];
  organizationSlug: string;
  workspaceSlug: string;
}) {
  const base = `/${organizationSlug}/${workspaceSlug}`;

  if (requests.length === 0) {
    return (
      <section className="overview-table-panel" aria-label="Recent Requests">
        <header className="panel-header">
          <div>
            <h2>Recent requests</h2>
            <p className="muted">
              Live stream of latest inferences processed by the gateway.
            </p>
          </div>
          <Link href={`${base}/logs`} className="panel-action-link">
            Open logs
          </Link>
        </header>
        <div className="overview-table-empty">
          <p>No requests executed yet in this workspace.</p>
          <Link href={`${base}/api-keys`} className="btn-secondary-sm">
            Create API Key
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overview-table-panel" aria-label="Recent Requests">
      <header className="panel-header">
        <div>
          <h2>Recent requests</h2>
          <p className="muted">
            Live preview of latest completions and latency.
          </p>
        </div>
        <Link href={`${base}/logs`} className="panel-action-link">
          View all in logs
        </Link>
      </header>

      <div className="table-responsive">
        <table className="overview-data-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Request ID</th>
              <th scope="col">Model</th>
              <th scope="col">Status</th>
              <th scope="col" className="text-right">
                Latency
              </th>
              <th scope="col" className="text-right">
                Tokens
              </th>
              <th scope="col" className="text-right">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td>
                  <span className="timestamp-cell" title={req.timestamp}>
                    {req.relativeTime}
                  </span>
                </td>
                <td>
                  <span className="request-id-cell font-mono">{req.id}</span>
                </td>
                <td>
                  <span className="model-tag font-mono">{req.modelId}</span>
                </td>
                <td>
                  <span
                    className={`status-pill ${
                      req.status === "succeeded"
                        ? "health"
                        : req.status === "rate_limited"
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {req.status === "succeeded"
                      ? "200 OK"
                      : req.status === "rate_limited"
                        ? "429 Limit"
                        : "Error"}
                  </span>
                </td>
                <td className="text-right font-mono font-tabular">
                  {req.durationMs}ms
                </td>
                <td className="text-right font-mono font-tabular">
                  {req.totalTokens.toLocaleString()}
                </td>
                <td className="text-right font-mono font-tabular">
                  {req.costFormatted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
