import type { OverviewTimeSeriesPoint } from "../../lib/overview-data";

export function UsageTrendChart({
  timeseries,
  period = "24h",
}: {
  timeseries: OverviewTimeSeriesPoint[];
  period?: string;
}) {
  const totalRequests = timeseries.reduce((sum, pt) => sum + pt.requests, 0);
  const maxRequests = Math.max(...timeseries.map((pt) => pt.requests), 1);

  if (totalRequests === 0 || timeseries.length === 0) {
    return (
      <section
        className="overview-chart-panel"
        aria-label="Request Volume Trend"
      >
        <header className="panel-header">
          <div>
            <h2>Request volume trend</h2>
            <p className="muted">
              Hourly requests and errors over the last{" "}
              {period === "24h" ? "24 hours" : period}.
            </p>
          </div>
          <span className="panel-badge">0 req/hr</span>
        </header>
        <div className="overview-chart-empty">
          <p>No request activity in this time range.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="overview-chart-panel" aria-label="Request Volume Trend">
      <header className="panel-header">
        <div>
          <h2>Request volume trend</h2>
          <p className="muted">
            Hourly requests and errors over the last{" "}
            {period === "24h" ? "24 hours" : period}.
          </p>
        </div>
        <div className="chart-legend-inline">
          <span className="legend-item">
            <i className="legend-dot ice" /> Succeeded
          </span>
          <span className="legend-item">
            <i className="legend-dot critical" /> Error
          </span>
        </div>
      </header>

      <div className="overview-bar-plot">
        <div className="bars-container">
          {timeseries.map((pt, idx) => {
            const heightPct = Math.max(
              8,
              Math.round((pt.requests / maxRequests) * 100),
            );
            const errorPct =
              pt.requests > 0 ? Math.round((pt.errors / pt.requests) * 100) : 0;

            return (
              <div className="bar-column" key={`${pt.timestamp}-${idx}`}>
                <div
                  className="bar-wrapper"
                  style={{ height: `${heightPct}%` }}
                >
                  <div className="bar-fill-success" />
                  {pt.errors > 0 && (
                    <div
                      className="bar-fill-error"
                      style={{ height: `${errorPct}%` }}
                    />
                  )}
                  <div className="bar-tooltip" role="tooltip">
                    <strong>{pt.label}</strong>
                    <span>
                      Requests: <b>{pt.requests.toLocaleString()}</b>
                    </span>
                    {pt.errors > 0 && (
                      <span className="text-danger">
                        Errors: <b>{pt.errors}</b>
                      </span>
                    )}
                    <span>
                      Tokens: <b>{pt.tokens.toLocaleString()}</b>
                    </span>
                  </div>
                </div>
                <span className="bar-label">{pt.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
