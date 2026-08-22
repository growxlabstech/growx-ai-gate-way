"use client";

import { useState } from "react";
import type {
  ExecutionState,
  PlaygroundTelemetry,
  StreamEventLog,
  ToolCallItem,
} from "../../lib/playground-types";

interface ResponseViewerProps {
  executionState: ExecutionState;
  streamedText: string;
  toolCalls: ToolCallItem[];
  telemetry: PlaygroundTelemetry;
  events: StreamEventLog[];
  rawRequestJson: string;
  rawResponseJson: string;
  errorMessage: string | null;
  errorCode: string | null;
}

export function ResponseViewer({
  executionState,
  streamedText,
  toolCalls,
  telemetry,
  events,
  rawRequestJson,
  rawResponseJson,
  errorMessage,
  errorCode,
}: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<
    "output" | "request" | "response" | "events"
  >("output");
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedRequestId, setCopiedRequestId] = useState(false);

  async function handleCopyText(
    text: string,
    setCopiedState: (v: boolean) => void,
  ) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2000);
    } catch {}
  }

  const isStreaming = executionState === "streaming";
  const isSubmitting = executionState === "submitting";

  // Format Status Badge
  function renderStatusBadge() {
    switch (executionState) {
      case "idle":
        return <span className="status-badge state-idle">Ready</span>;
      case "submitting":
        return (
          <span className="status-badge state-submitting">
            <span className="pulse-dot" /> Connecting…
          </span>
        );
      case "streaming":
        return (
          <span className="status-badge state-streaming">
            <span className="pulse-dot active" /> Streaming
          </span>
        );
      case "completed":
        return (
          <span className="status-badge state-completed">Completed ✓</span>
        );
      case "failed":
        return <span className="status-badge state-failed">Failed ✕</span>;
      case "cancelled":
        return (
          <span className="status-badge state-cancelled">Cancelled ■</span>
        );
    }
  }

  return (
    <div
      className="response-viewer-pane"
      role="region"
      aria-label="Response and Execution Output"
    >
      {/* 1. Top Telemetry Bar */}
      <div className="telemetry-bar">
        <div className="telemetry-left">
          {renderStatusBadge()}

          {telemetry.requestId ? (
            <button
              type="button"
              className="telemetry-item req-id-btn"
              onClick={() =>
                handleCopyText(telemetry.requestId!, setCopiedRequestId)
              }
              title="Click to copy Request ID"
              aria-label={`Request ID ${telemetry.requestId}`}
            >
              <span className="telemetry-label">ID:</span>
              <span className="telemetry-val req-id-val">
                {telemetry.requestId}
              </span>
              <span className="copy-sub">{copiedRequestId ? "✓" : "📋"}</span>
            </button>
          ) : null}
        </div>

        <div className="telemetry-right">
          {telemetry.status ? (
            <span
              className={`telemetry-item http-status status-${Math.floor(telemetry.status / 100)}xx`}
            >
              {telemetry.status}
            </span>
          ) : null}

          {telemetry.ttftMs !== null ? (
            <span className="telemetry-item" title="Time To First Token">
              <span className="telemetry-label">TTFT:</span>
              <span className="telemetry-val">{telemetry.ttftMs}ms</span>
            </span>
          ) : null}

          {telemetry.totalLatencyMs !== null ? (
            <span className="telemetry-item" title="Total Roundtrip Duration">
              <span className="telemetry-label">Latency:</span>
              <span className="telemetry-val">
                {telemetry.totalLatencyMs}ms
              </span>
            </span>
          ) : null}

          {telemetry.totalTokens !== null ? (
            <span className="telemetry-item" title="Authoritative Token Usage">
              <span className="telemetry-label">Tokens:</span>
              <span className="telemetry-val">
                {telemetry.inputTokens ?? 0} in · {telemetry.outputTokens ?? 0}{" "}
                out ({telemetry.totalTokens})
              </span>
            </span>
          ) : null}

          {telemetry.costFormatted !== null ? (
            <span
              className="telemetry-item telemetry-cost"
              title="Authoritative Phase-16 Settled Cost"
            >
              <span className="telemetry-label">Cost:</span>
              <span className="telemetry-val">{telemetry.costFormatted}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* 2. Response View Navigation Tabs */}
      <div className="response-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "output"}
          className={`resp-tab-btn ${activeTab === "output" ? "is-active" : ""}`}
          onClick={() => setActiveTab("output")}
        >
          Output
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "request"}
          className={`resp-tab-btn ${activeTab === "request" ? "is-active" : ""}`}
          onClick={() => setActiveTab("request")}
        >
          Raw Request
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "response"}
          className={`resp-tab-btn ${activeTab === "response" ? "is-active" : ""}`}
          onClick={() => setActiveTab("response")}
        >
          Raw Response
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "events"}
          className={`resp-tab-btn ${activeTab === "events" ? "is-active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          Events {events.length > 0 ? `(${events.length})` : ""}
        </button>

        {streamedText ? (
          <button
            type="button"
            className="btn-copy-resp"
            onClick={() => handleCopyText(streamedText, setCopiedResponse)}
          >
            {copiedResponse ? "Copied ✓" : "Copy Output"}
          </button>
        ) : null}
      </div>

      {/* 3. Tab Contents */}
      <div className="response-content-area">
        {/* Tab A: Output */}
        {activeTab === "output" ? (
          <div className="output-scroll-container">
            {/* Error Banner */}
            {errorMessage ? (
              <div className="response-error-banner" role="alert">
                <div className="error-badge">
                  Error ({errorCode ?? "execution_failed"})
                </div>
                <div className="error-message-text">{errorMessage}</div>
              </div>
            ) : null}

            {/* Connecting State */}
            {isSubmitting && !streamedText && toolCalls.length === 0 ? (
              <div className="submitting-state">
                <span className="spinner-sm" />
                <span>Connecting to GrowX Gateway…</span>
              </div>
            ) : null}

            {/* Empty State */}
            {executionState === "idle" &&
            !streamedText &&
            toolCalls.length === 0 &&
            !errorMessage ? (
              <div className="response-empty-state">
                <div className="empty-icon">◈</div>
                <div className="empty-title">Ready for execution</div>
                <div className="empty-subtitle">
                  Compose your request in the composer and click{" "}
                  <strong>Run</strong> to stream real model output and inspect
                  Gateway execution metrics.
                </div>
              </div>
            ) : null}

            {/* Streamed Output Text */}
            {streamedText ? (
              <div className="streamed-output-box">
                <pre className="streamed-text-pre">
                  <code>{streamedText}</code>
                  {isStreaming ? (
                    <span className="stream-cursor" aria-hidden="true">
                      ▍
                    </span>
                  ) : null}
                </pre>
              </div>
            ) : null}

            {/* Tool Calls Cards */}
            {toolCalls.length > 0 ? (
              <div
                className="tool-calls-container"
                aria-label="Model Requested Tool Calls"
              >
                <h4 className="tool-calls-title">Model Requested Tool Calls</h4>
                {toolCalls.map((tc) => (
                  <div key={tc.id} className="tool-call-card">
                    <div className="tool-call-header">
                      <span className="tool-badge">Function</span>
                      <span className="tool-call-name">{tc.function.name}</span>
                      <span className="tool-call-id">{tc.id}</span>
                    </div>
                    <div className="tool-call-arguments">
                      <pre className="tool-args-pre">
                        <code>{tc.function.arguments}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Tab B: Raw Request */}
        {activeTab === "request" ? (
          <div className="raw-json-container">
            <pre className="raw-json-pre">
              <code>{rawRequestJson || "// No request dispatched yet"}</code>
            </pre>
          </div>
        ) : null}

        {/* Tab C: Raw Response */}
        {activeTab === "response" ? (
          <div className="raw-json-container">
            <pre className="raw-json-pre">
              <code>{rawResponseJson || "// No response received yet"}</code>
            </pre>
          </div>
        ) : null}

        {/* Tab D: Stream Events Timeline */}
        {activeTab === "events" ? (
          <div className="events-timeline-container">
            {events.length === 0 ? (
              <div className="empty-events-note">
                No SSE events captured for this request.
              </div>
            ) : (
              <div className="events-list">
                {events.map((evt, idx) => (
                  <div
                    key={evt.id}
                    className={`event-log-item type-${evt.type}`}
                  >
                    <div className="event-item-top">
                      <span className="event-index">#{idx + 1}</span>
                      <span className="event-type-tag">{evt.type}</span>
                      <span className="event-timestamp">
                        +{evt.timestamp}ms
                      </span>
                    </div>
                    <div className="event-summary">{evt.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
