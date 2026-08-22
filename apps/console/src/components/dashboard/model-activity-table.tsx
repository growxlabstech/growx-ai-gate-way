import Link from "next/link";
import type { OverviewModelActivityItem } from "../../lib/overview-data";

export function ModelActivityTable({
  models,
  organizationSlug,
  workspaceSlug,
}: {
  models: OverviewModelActivityItem[];
  organizationSlug: string;
  workspaceSlug: string;
}) {
  const base = `/${organizationSlug}/${workspaceSlug}`;

  if (models.length === 0) {
    return (
      <section className="overview-table-panel" aria-label="Model Activity">
        <header className="panel-header">
          <div>
            <h2>Active models</h2>
            <p className="muted">
              Traffic distribution across routed AI models.
            </p>
          </div>
          <Link href={`${base}/models`} className="panel-action-link">
            Browse models
          </Link>
        </header>
        <div className="overview-table-empty">
          <p>No model activity recorded yet in this workspace.</p>
          <Link href={`${base}/playground`} className="btn-secondary-sm">
            Open Playground
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overview-table-panel" aria-label="Model Activity">
      <header className="panel-header">
        <div>
          <h2>Active models</h2>
          <p className="muted">
            Traffic distribution and success rates across routed models.
          </p>
        </div>
        <Link href={`${base}/models`} className="panel-action-link">
          All models
        </Link>
      </header>

      <div className="table-responsive">
        <table className="overview-data-table">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Provider</th>
              <th scope="col" className="text-right">
                Requests
              </th>
              <th scope="col" className="text-right">
                Total tokens
              </th>
              <th scope="col">Traffic share</th>
              <th scope="col" className="text-right">
                Success rate
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((item) => (
              <tr key={item.modelId}>
                <td>
                  <span className="model-name-cell font-mono">
                    {item.modelId}
                  </span>
                </td>
                <td>
                  <span className="provider-tag">{item.provider}</span>
                </td>
                <td className="text-right font-mono font-tabular">
                  {item.requests.toLocaleString()}
                </td>
                <td className="text-right font-mono font-tabular">
                  {item.totalTokens.toLocaleString()}
                </td>
                <td>
                  <div className="share-bar-wrapper">
                    <div className="share-progress-track">
                      <div
                        className="share-progress-fill"
                        style={{
                          width: `${Math.max(4, Math.min(100, item.share))}%`,
                        }}
                      />
                    </div>
                    <span className="share-percentage font-mono font-tabular">
                      {item.share.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="text-right">
                  <span
                    className={`status-pill ${
                      item.successRate >= 99
                        ? "health"
                        : item.successRate >= 95
                          ? "warning"
                          : "critical"
                    }`}
                  >
                    {item.successRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
