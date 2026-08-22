"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ApiKeyUsageItem,
  ErrorCategoryBreakdown,
  ModelUsageItem,
  TimeRangeOption,
  WorkspaceUsageSummaryData,
  AnalyticsTimeSeriesPoint,
} from "../../lib/analytics-data";

interface UsageOverviewViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  summary: WorkspaceUsageSummaryData;
  timeseries: AnalyticsTimeSeriesPoint[];
  models: ModelUsageItem[];
  apiKeys: ApiKeyUsageItem[];
  errors: ErrorCategoryBreakdown[];
}

export function UsageOverviewView({
  organizationSlug,
  workspaceSlug,
  summary,
  timeseries,
  models,
  apiKeys,
  errors,
}: UsageOverviewViewProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRangeOption>("24h");
  const [activeTab, setActiveTab] = useState<"models" | "keys" | "errors">(
    "models",
  );

  const baseLogsUrl = `/${organizationSlug}/${workspaceSlug}/logs`;

  // Calculate SVG Trend line coordinates
  const maxReqs = Math.max(...timeseries.map((p) => p.requestsTotal), 10);
  const maxTokens = Math.max(...timeseries.map((p) => p.totalTokens), 1000);
  const chartHeight = 120;
  const chartWidth = 560;

  const reqPoints = timeseries
    .map((p, idx) => {
      const x = (idx / (timeseries.length - 1 || 1)) * chartWidth;
      const y =
        chartHeight - (p.requestsTotal / maxReqs) * (chartHeight - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const tokenPoints = timeseries
    .map((p, idx) => {
      const x = (idx / (timeseries.length - 1 || 1)) * chartWidth;
      const y =
        chartHeight - (p.totalTokens / maxTokens) * (chartHeight - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      className="usage-analytics-container"
      data-testid="usage-analytics-root"
    >
      {/* 1. Header Toolbar: Time Range Filter + Freshness */}
      <div className="analytics-header-bar">
        <div
          className="time-range-toggle-group"
          role="group"
          aria-label="Select Time Range"
        >
          <button
            type="button"
            className={`time-range-btn ${selectedRange === "24h" ? "is-active" : ""}`}
            onClick={() => setSelectedRange("24h")}
          >
            24 Hours
          </button>
          <button
            type="button"
            className={`time-range-btn ${selectedRange === "7d" ? "is-active" : ""}`}
            onClick={() => setSelectedRange("7d")}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`time-range-btn ${selectedRange === "30d" ? "is-active" : ""}`}
            onClick={() => setSelectedRange("30d")}
          >
            30 Days
          </button>
          <button
            type="button"
            className={`time-range-btn ${selectedRange === "90d" ? "is-active" : ""}`}
            onClick={() => setSelectedRange("90d")}
          >
            90 Days
          </button>
        </div>

        <div className="analytics-header-right">
          <span
            className="freshness-badge"
            title="Analytics projection engine update latency"
          >
            <span className="live-dot" /> Projected{" "}
            {summary.dataFreshness.lagSeconds}s ago
          </span>
          <Link href={baseLogsUrl} className="btn-secondary btn-sm">
            View Request Logs →
          </Link>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="metric-cards-grid">
        {/* Card 1: Total Requests & Success Rate */}
        <div className="analytics-metric-card">
          <span className="metric-card-label">Total Requests</span>
          <div className="metric-card-value-row">
            <span className="metric-card-number">
              {summary.requests.total.toLocaleString()}
            </span>
            <span
              className={`metric-sub-badge ${summary.requests.successRate >= 99 ? "badge-success" : "badge-warning"}`}
            >
              {summary.requests.successRate}% Success
            </span>
          </div>
          <span className="metric-card-sub">
            {summary.requests.completed.toLocaleString()} completed ·{" "}
            {summary.requests.failed} failed ({summary.requests.rateLimited}{" "}
            rate limited)
          </span>
        </div>

        {/* Card 2: Token Consumption */}
        <div className="analytics-metric-card">
          <span className="metric-card-label">Token Consumption</span>
          <div className="metric-card-value-row">
            <span className="metric-card-number">
              {(summary.tokens.totalTokens / 1000).toFixed(1)}k
            </span>
            <span className="metric-unit-tag">tokens</span>
          </div>
          <span className="metric-card-sub">
            {(summary.tokens.inputTokens / 1000).toFixed(1)}k in ·{" "}
            {(summary.tokens.outputTokens / 1000).toFixed(1)}k out (
            {(summary.tokens.cachedInputTokens / 1000).toFixed(1)}k cached)
          </span>
        </div>

        {/* Card 3: Total Spend */}
        <div className="analytics-metric-card">
          <span className="metric-card-label">Total Settled Spend</span>
          <div className="metric-card-value-row">
            <span className="metric-card-number text-accent-success">
              {summary.financials.totalCostFormatted}
            </span>
            <span className="metric-currency-tag">
              {summary.financials.currency}
            </span>
          </div>
          <span className="metric-card-sub">
            Authoritative Phase-16 price snapshot settlement
          </span>
        </div>

        {/* Card 4: Latency Percentiles */}
        <div className="analytics-metric-card">
          <span className="metric-card-label">Latency (P95 / TTFT)</span>
          <div className="metric-card-value-row">
            <span className="metric-card-number">
              {summary.latency.p95Ms}ms
            </span>
            <span className="metric-ttft-tag">TTFT {summary.ttft.p50Ms}ms</span>
          </div>
          <span className="metric-card-sub">
            P50: {summary.latency.p50Ms}ms · P99: {summary.latency.p99Ms}ms ·
            Mean: {summary.latency.meanMs}ms
          </span>
        </div>
      </div>

      {/* 3. Dual Trend Analysis (Requests & Tokens/Spend) */}
      <div className="analytics-charts-grid">
        {/* Chart A: Request Velocity */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <div>
              <h3 className="chart-title">Request Volume & Velocity</h3>
              <p className="chart-subtitle">
                Hourly completed requests and upstream error frequency
              </p>
            </div>
            <span className="chart-legend-tag legend-ice">Requests</span>
          </div>

          <div className="svg-chart-wrap" aria-label="Request Volume Chart">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="analytics-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--accent-cool)"
                    stopOpacity="0.25"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent-cool)"
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1="0"
                y1={chartHeight / 2}
                x2={chartWidth}
                y2={chartHeight / 2}
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1={chartHeight - 10}
                x2={chartWidth}
                y2={chartHeight - 10}
                stroke="var(--border-subtle)"
              />

              {/* Area fill & Path */}
              <polygon
                points={`0,${chartHeight - 10} ${reqPoints} ${chartWidth},${chartHeight - 10}`}
                fill="url(#reqGradient)"
              />
              <polyline
                points={reqPoints}
                fill="none"
                stroke="var(--accent-cool)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* X-Axis Labels */}
            <div className="chart-x-labels">
              {timeseries.map((p) => (
                <span key={p.timestamp} className="x-label">
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Chart B: Token Consumption Trend */}
        <div className="analytics-chart-panel">
          <div className="chart-panel-header">
            <div>
              <h3 className="chart-title">Token Consumption Trend</h3>
              <p className="chart-subtitle">
                Prompt and completion token volume over time
              </p>
            </div>
            <span className="chart-legend-tag legend-frost">Tokens</span>
          </div>

          <div className="svg-chart-wrap" aria-label="Token Consumption Chart">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="analytics-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8be9fd" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#8be9fd" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1="0"
                y1={chartHeight / 2}
                x2={chartWidth}
                y2={chartHeight / 2}
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1={chartHeight - 10}
                x2={chartWidth}
                y2={chartHeight - 10}
                stroke="var(--border-subtle)"
              />

              {/* Area fill & Path */}
              <polygon
                points={`0,${chartHeight - 10} ${tokenPoints} ${chartWidth},${chartHeight - 10}`}
                fill="url(#tokenGradient)"
              />
              <polyline
                points={tokenPoints}
                fill="none"
                stroke="#8be9fd"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* X-Axis Labels */}
            <div className="chart-x-labels">
              {timeseries.map((p) => (
                <span key={p.timestamp} className="x-label">
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Multimodal Consumption Bar */}
      <div className="modality-summary-strip">
        <h4 className="modality-title">Usage by Modality</h4>
        <div className="modality-items-row">
          <div className="modality-pill">
            <span className="modality-label">Text & Chat</span>
            <span className="modality-value">
              {summary.modalities.textTokens.toLocaleString()} tokens
            </span>
          </div>
          <div className="modality-pill">
            <span className="modality-label">Vision & Image</span>
            <span className="modality-value">
              {summary.modalities.imageUnits} images
            </span>
          </div>
          <div className="modality-pill">
            <span className="modality-label">Audio & Speech</span>
            <span className="modality-value">
              {summary.modalities.audioSeconds}s audio
            </span>
          </div>
          <div className="modality-pill">
            <span className="modality-label">Embeddings</span>
            <span className="modality-value">
              {summary.modalities.embeddingTokens.toLocaleString()} tokens
            </span>
          </div>
        </div>
      </div>

      {/* 5. Breakdown Tabs: Models / API Keys / Errors */}
      <div className="breakdown-section-wrap">
        <div className="breakdown-tabs-header" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "models"}
            className={`breakdown-tab-btn ${activeTab === "models" ? "is-active" : ""}`}
            onClick={() => setActiveTab("models")}
          >
            Model Breakdown ({models.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "keys"}
            className={`breakdown-tab-btn ${activeTab === "keys" ? "is-active" : ""}`}
            onClick={() => setActiveTab("keys")}
          >
            API Key Breakdown ({apiKeys.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "errors"}
            className={`breakdown-tab-btn ${activeTab === "errors" ? "is-active" : ""}`}
            onClick={() => setActiveTab("errors")}
          >
            Error Breakdown ({errors.length})
          </button>
        </div>

        {/* Tab 1: Models Table */}
        {activeTab === "models" ? (
          <div className="breakdown-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Family</th>
                  <th className="num-col">Requests</th>
                  <th className="num-col">Share</th>
                  <th className="num-col">Total Tokens</th>
                  <th className="num-col">Spend</th>
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
                    <td className="num-col">{m.sharePercentage}%</td>
                    <td className="num-col">
                      {m.totalTokens.toLocaleString()}
                    </td>
                    <td className="num-col text-accent-success">
                      {m.costFormatted}
                    </td>
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
        ) : null}

        {/* Tab 2: API Keys Table */}
        {activeTab === "keys" ? (
          <div className="breakdown-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Prefix / Identifier</th>
                  <th className="num-col">Requests</th>
                  <th className="num-col">Total Tokens</th>
                  <th className="num-col">Spend</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.apiKeyId}>
                    <td>
                      <strong>{k.name}</strong>
                    </td>
                    <td>
                      <code className="key-prefix-code">{k.maskedPrefix}</code>
                    </td>
                    <td className="num-col">{k.requests.toLocaleString()}</td>
                    <td className="num-col">
                      {k.totalTokens.toLocaleString()}
                    </td>
                    <td className="num-col text-accent-success">
                      {k.costFormatted}
                    </td>
                    <td className="muted-cell">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleTimeString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Tab 3: Errors Table */}
        {activeTab === "errors" ? (
          <div className="breakdown-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Canonical Code</th>
                  <th className="num-col">Occurrences</th>
                  <th className="num-col">Share</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => (
                  <tr key={err.code}>
                    <td>
                      <span className="badge-danger">{err.category}</span>
                    </td>
                    <td>
                      <code className="error-code-badge">{err.code}</code>
                    </td>
                    <td className="num-col font-bold">{err.count}</td>
                    <td className="num-col">{err.percentage}%</td>
                    <td className="muted-cell">{err.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
