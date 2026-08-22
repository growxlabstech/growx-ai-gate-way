"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkspaceRequestDetail } from "../../lib/analytics-data";

interface RequestDetailViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  detail: WorkspaceRequestDetail;
}

export function RequestDetailView({
  organizationSlug,
  workspaceSlug,
  detail,
}: RequestDetailViewProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "content" | "attempts" | "raw"
  >("overview");
  const [copiedId, setCopiedId] = useState(false);
  const [copiedRawReq, setCopiedRawReq] = useState(false);
  const [copiedRawResp, setCopiedRawResp] = useState(false);

  const baseLogsUrl = `/${organizationSlug}/${workspaceSlug}/logs`;

  async function handleCopy(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="request-detail-container" data-testid="request-detail-root">
      {/* 1. Back Navigation & Header */}
      <div className="detail-top-nav">
        <Link href={baseLogsUrl} className="btn-back-link">
          ← Back to Request Logs
        </Link>
      </div>

      <div className="detail-header-card">
        <div className="detail-header-left">
          <div className="detail-id-row">
            <h1 className="detail-request-id">{detail.requestId}</h1>
            <button
              type="button"
              className="btn-copy-id"
              onClick={() => handleCopy(detail.requestId, setCopiedId)}
              title="Copy Request ID"
              aria-label={`Copy Request ID ${detail.requestId}`}
            >
              {copiedId ? "Copied ✓" : "Copy ID 📋"}
            </button>
          </div>
          <div className="detail-meta-row">
            <span className={`status-pill status-${detail.status}`}>
              {detail.status.toUpperCase()} ({detail.httpStatus})
            </span>
            <span className="model-chip">{detail.model}</span>
            <span className="timestamp-tag">
              {new Date(detail.timestamp).toUTCString()}
            </span>
            <span className="operation-tag">{detail.operation}</span>
          </div>
        </div>

        <div className="detail-header-right">
          <div className="detail-cost-box">
            <span className="cost-label">Settled Cost</span>
            <span className="cost-val">{detail.costFormatted}</span>
            <span className="cost-hint">Authoritative Phase-16 Record</span>
          </div>
        </div>
      </div>

      {/* 2. High-Density Execution Metrics Strip */}
      <div className="detail-metrics-grid">
        <div className="detail-metric-item">
          <span className="metric-lbl">Total Latency</span>
          <span className="metric-val font-mono">{detail.durationMs}ms</span>
          <span className="metric-sub">
            Gateway overhead: {detail.gatewayOverheadMs}ms
          </span>
        </div>

        <div className="detail-metric-item">
          <span className="metric-lbl">Time to First Token (TTFT)</span>
          <span className="metric-val font-mono">
            {detail.ttftMs !== null
              ? `${detail.ttftMs}ms`
              : "N/A (Non-stream / Failed)"}
          </span>
          <span className="metric-sub">
            {detail.streaming ? "Streaming active" : "Standard buffered"}
          </span>
        </div>

        <div className="detail-metric-item">
          <span className="metric-lbl">Tokens (In / Out / Total)</span>
          <span className="metric-val font-mono">
            {detail.tokens.inputTokens} / {detail.tokens.outputTokens} (
            {detail.tokens.totalTokens})
          </span>
          <span className="metric-sub">
            Cached: {detail.tokens.cachedInputTokens} · Reasoning:{" "}
            {detail.tokens.reasoningTokens}
          </span>
        </div>

        <div className="detail-metric-item">
          <span className="metric-lbl">API Key</span>
          <span className="metric-val text-ellipsis" title={detail.apiKey.name}>
            {detail.apiKey.name}
          </span>
          <span className="metric-sub font-mono">
            {detail.apiKey.maskedPrefix}
          </span>
        </div>
      </div>

      {/* 3. Error Banner (If failed) */}
      {detail.error ? (
        <div className="detail-error-card" role="alert">
          <div className="error-card-top">
            <span className="badge-danger">Error Diagnostics</span>
            <code className="error-code-val">{detail.error.code}</code>
            <span className="error-type-val">({detail.error.type})</span>
            {detail.error.retryable ? (
              <span className="badge-warning">Retryable Error</span>
            ) : (
              <span className="badge-subtle">Non-Retryable</span>
            )}
          </div>
          <div className="error-card-msg">{detail.error.message}</div>
        </div>
      ) : null}

      {/* 4. Tab Navigation */}
      <div className="detail-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className={`detail-tab-btn ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Execution Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "content"}
          className={`detail-tab-btn ${activeTab === "content" ? "is-active" : ""}`}
          onClick={() => setActiveTab("content")}
        >
          Prompt & Response Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "attempts"}
          className={`detail-tab-btn ${activeTab === "attempts" ? "is-active" : ""}`}
          onClick={() => setActiveTab("attempts")}
        >
          Provider Attempts ({detail.attempts.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "raw"}
          className={`detail-tab-btn ${activeTab === "raw" ? "is-active" : ""}`}
          onClick={() => setActiveTab("raw")}
        >
          Raw JSON Payload
        </button>
      </div>

      {/* 5. Tab Panels */}
      <div className="detail-tab-content-area">
        {/* Tab A: Overview */}
        {activeTab === "overview" ? (
          <div className="overview-tab-pane">
            <div className="metadata-table-card">
              <h3 className="section-title">Request Context & Scoping</h3>
              <dl className="metadata-dl">
                <div className="dl-row">
                  <dt>Request ID</dt>
                  <dd>
                    <code>{detail.requestId}</code>
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Organization</dt>
                  <dd>
                    {detail.organizationSlug} (
                    <code>{detail.organizationId}</code>)
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Workspace</dt>
                  <dd>
                    {detail.workspaceSlug} (<code>{detail.workspaceId}</code>)
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Model Selected</dt>
                  <dd>
                    <span className="model-chip">{detail.model}</span>
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Workload Classification</dt>
                  <dd>
                    <span className="badge-subtle">{detail.workloadType}</span>
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Governance Retention Status</dt>
                  <dd>
                    {detail.governance.contentRetained ? (
                      <span className="badge-success">
                        Content Retained (Policy Active)
                      </span>
                    ) : (
                      <span className="badge-warning">
                        Zero Content Retention (Metadata Only)
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {/* Tab B: Content & Prompt (Governance Aware) */}
        {activeTab === "content" ? (
          <div className="content-tab-pane">
            {!detail.governance.contentRetained ? (
              <div
                className="governance-notice-card"
                role="region"
                aria-label="Governance Policy Notice"
              >
                <div className="governance-icon">🛡️</div>
                <div className="governance-title">
                  Prompt & Output Content Not Retained
                </div>
                <p className="governance-detail">
                  {detail.governance.reasonMessage}
                </p>
                <div className="governance-footer">
                  <span>
                    To enable prompt archiving, configure data retention under
                    Workspace Settings.
                  </span>
                </div>
              </div>
            ) : (
              <div className="chat-messages-viewer">
                <h3 className="section-title">Prompt Messages</h3>
                <div className="messages-stream">
                  {detail.promptContent?.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`chat-bubble-card role-${msg.role}`}
                    >
                      <div className="bubble-header">
                        <span className="role-tag">
                          {msg.role.toUpperCase()}
                        </span>
                      </div>
                      <pre className="bubble-content-pre">
                        <code>{msg.content}</code>
                      </pre>
                    </div>
                  ))}
                </div>

                {detail.responseContent ? (
                  <>
                    <h3 className="section-title" style={{ marginTop: "24px" }}>
                      Assistant Completion
                    </h3>
                    <div className="chat-bubble-card role-assistant">
                      <div className="bubble-header">
                        <span className="role-tag">ASSISTANT</span>
                      </div>
                      <pre className="bubble-content-pre">
                        <code>{detail.responseContent}</code>
                      </pre>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {/* Tab C: Provider Attempts */}
        {activeTab === "attempts" ? (
          <div className="attempts-tab-pane">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Attempt #</th>
                  <th>Provider</th>
                  <th>Upstream Model</th>
                  <th>Status</th>
                  <th className="num-col">Duration</th>
                  <th className="num-col">TTFT</th>
                  <th className="num-col">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {detail.attempts.map((att) => (
                  <tr key={att.attemptNumber}>
                    <td>
                      <strong>#{att.attemptNumber}</strong>
                    </td>
                    <td>
                      <span className="badge-subtle">{att.providerId}</span>
                    </td>
                    <td>
                      <code>{att.providerModelId}</code>
                    </td>
                    <td>
                      <span className={`status-pill status-${att.status}`}>
                        {att.status}
                      </span>
                    </td>
                    <td className="num-col font-mono">{att.durationMs}ms</td>
                    <td className="num-col font-mono">
                      {att.ttftMs !== null ? `${att.ttftMs}ms` : "—"}
                    </td>
                    <td className="num-col font-mono">
                      {att.usage.totalTokens}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Tab D: Raw JSON Payloads */}
        {activeTab === "raw" ? (
          <div className="raw-tab-pane">
            <div className="raw-box-section">
              <div className="raw-box-header">
                <h4>Canonical Request Payload</h4>
                {detail.rawRequestJson ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      handleCopy(detail.rawRequestJson!, setCopiedRawReq)
                    }
                  >
                    {copiedRawReq ? "Copied ✓" : "Copy Request JSON"}
                  </button>
                ) : null}
              </div>
              <pre className="raw-json-pre">
                <code>
                  {detail.rawRequestJson ??
                    "// Content not retained under governance policy"}
                </code>
              </pre>
            </div>

            <div className="raw-box-section" style={{ marginTop: "20px" }}>
              <div className="raw-box-header">
                <h4>Canonical Response Payload</h4>
                {detail.rawResponseJson ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      handleCopy(detail.rawResponseJson!, setCopiedRawResp)
                    }
                  >
                    {copiedRawResp ? "Copied ✓" : "Copy Response JSON"}
                  </button>
                ) : null}
              </div>
              <pre className="raw-json-pre">
                <code>
                  {detail.rawResponseJson ??
                    "// Content not retained under governance policy"}
                </code>
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
