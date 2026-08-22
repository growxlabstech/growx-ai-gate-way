"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConsoleModelItem } from "../../lib/models-data";
import type {
  RequestHistoryFilterOptions,
  RequestHistoryPage,
  RequestStatusFilter,
  TimeRangeOption,
} from "../../lib/analytics-data";

interface RequestHistoryViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  historyPage: RequestHistoryPage;
  models: ConsoleModelItem[];
  initialFilters: RequestHistoryFilterOptions;
}

export function RequestHistoryView({
  organizationSlug,
  workspaceSlug,
  historyPage,
  models,
  initialFilters,
}: RequestHistoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [modelFilter, setModelFilter] = useState(initialFilters.model ?? "all");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>(
    initialFilters.status ?? "all",
  );
  const [timeRange, setTimeRange] = useState<TimeRangeOption>(
    initialFilters.timeRange ?? "24h",
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const baseLogsUrl = `/${organizationSlug}/${workspaceSlug}/logs`;

  function applyFilters(updates: Partial<RequestHistoryFilterOptions>) {
    const nextModel = updates.model !== undefined ? updates.model : modelFilter;
    const nextStatus =
      updates.status !== undefined ? updates.status : statusFilter;
    const nextSearch = updates.search !== undefined ? updates.search : search;
    const nextRange =
      updates.timeRange !== undefined ? updates.timeRange : timeRange;

    const params = new URLSearchParams();
    if (nextModel && nextModel !== "all") params.set("model", nextModel);
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (nextSearch) params.set("search", nextSearch);
    if (nextRange && nextRange !== "24h") params.set("range", nextRange);

    const q = params.toString();
    router.push(q ? `${baseLogsUrl}?${q}` : baseLogsUrl);
  }

  function handleReset() {
    setSearch("");
    setModelFilter("all");
    setStatusFilter("all");
    setTimeRange("24h");
    router.push(baseLogsUrl);
  }

  async function handleCopyId(reqId: string) {
    try {
      await navigator.clipboard.writeText(reqId);
      setCopiedId(reqId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  const hasActiveFilters =
    search ||
    modelFilter !== "all" ||
    statusFilter !== "all" ||
    timeRange !== "24h";

  return (
    <div
      className="request-history-container"
      data-testid="request-history-root"
    >
      {/* 1. Search & Filter Bar */}
      <div className="history-filter-bar">
        <div className="filter-input-wrap">
          <input
            type="text"
            placeholder="Search by Request ID or Model…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              applyFilters({ search: e.target.value });
            }}
            className="filter-search-input"
            aria-label="Search requests"
          />
        </div>

        <div className="filter-dropdowns-group">
          {/* Model Filter */}
          <select
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              applyFilters({ model: e.target.value });
            }}
            className="filter-select"
            aria-label="Filter by model"
          >
            <option value="all">All Models</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.id})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as RequestStatusFilter;
              setStatusFilter(val);
              applyFilters({ status: val });
            }}
            className="filter-select"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="rate_limited">Rate Limited</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Time Range Filter */}
          <select
            value={timeRange}
            onChange={(e) => {
              const val = e.target.value as TimeRangeOption;
              setTimeRange(val);
              applyFilters({ timeRange: val });
            }}
            className="filter-select"
            aria-label="Filter by time range"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {hasActiveFilters ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleReset}
            >
              Reset Filters
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Request History Table */}
      <div className="history-table-container">
        {historyPage.items.length === 0 ? (
          <div
            className="history-empty-card"
            role="region"
            aria-label="No requests found"
          >
            <div className="empty-icon">🔍</div>
            <div className="empty-title">
              {hasActiveFilters
                ? "No requests match active filters"
                : "No requests recorded yet"}
            </div>
            <p className="empty-subtitle">
              {hasActiveFilters
                ? "Try clearing or broadening your search parameters to find recorded Gateway executions."
                : "Execute inference requests via the API or Playground to see detailed execution logs and metrics."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleReset}
              >
                Clear Active Filters
              </button>
            ) : (
              <Link
                href={`/${organizationSlug}/${workspaceSlug}/playground`}
                className="btn-primary"
              >
                Open Playground →
              </Link>
            )}
          </div>
        ) : (
          <table className="data-table history-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Request ID</th>
                <th>Model</th>
                <th>Status</th>
                <th className="num-col">Duration</th>
                <th className="num-col">TTFT</th>
                <th className="num-col">Tokens</th>
                <th className="num-col">Cost</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {historyPage.items.map((req) => {
                const detailUrl = `${baseLogsUrl}/${req.requestId}`;

                return (
                  <tr key={req.id} className={`status-row-${req.status}`}>
                    {/* Timestamp */}
                    <td
                      className="timestamp-cell"
                      title={new Date(req.timestamp).toISOString()}
                    >
                      <span className="relative-time">{req.relativeTime}</span>
                    </td>

                    {/* Request ID */}
                    <td>
                      <div className="req-id-cell">
                        <Link href={detailUrl} className="req-id-link">
                          <code>{req.requestId}</code>
                        </Link>
                        <button
                          type="button"
                          className="btn-copy-mini"
                          onClick={() => handleCopyId(req.requestId)}
                          title="Copy Request ID"
                          aria-label={`Copy Request ID ${req.requestId}`}
                        >
                          {copiedId === req.requestId ? "✓" : "📋"}
                        </button>
                      </div>
                    </td>

                    {/* Model */}
                    <td>
                      <span className="model-chip" title={req.model}>
                        {req.model}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span
                        className={`status-pill status-${req.status}`}
                        title={
                          req.errorCode
                            ? `Error: ${req.errorCode}`
                            : `Status: ${req.status}`
                        }
                      >
                        {req.status === "succeeded" && "Succeeded"}
                        {req.status === "failed" && "Failed"}
                        {req.status === "cancelled" && "Cancelled"}
                        {req.status === "rate_limited" && "Rate Limited"}
                        {req.status === "processing" && "Processing"}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="num-col font-mono">{req.durationMs}ms</td>

                    {/* TTFT */}
                    <td className="num-col font-mono muted-cell">
                      {req.ttftMs !== null ? `${req.ttftMs}ms` : "—"}
                    </td>

                    {/* Tokens */}
                    <td
                      className="num-col font-mono"
                      title={`${req.tokens.inputTokens} in / ${req.tokens.outputTokens} out`}
                    >
                      {req.tokens.totalTokens.toLocaleString()}
                    </td>

                    {/* Cost */}
                    <td className="num-col text-accent-success font-mono font-bold">
                      {req.costFormatted}
                    </td>

                    {/* Action */}
                    <td>
                      <Link
                        href={detailUrl}
                        className="btn-detail-link"
                        aria-label={`Inspect request ${req.requestId}`}
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Pagination Footer */}
      <div className="history-pagination-bar">
        <span className="pagination-count-label">
          Showing {historyPage.items.length} requests{" "}
          {historyPage.totalCount ? `of ${historyPage.totalCount}` : ""}
        </span>

        <div className="pagination-buttons">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!searchParams.get("cursor")}
            onClick={() => router.push(baseLogsUrl)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!historyPage.hasMore}
            onClick={() => {
              if (historyPage.nextCursor) {
                applyFilters({ cursor: historyPage.nextCursor });
              }
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
