"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsoleModelItem } from "../../lib/models-data";

interface ModelDetailViewProps {
  model: ConsoleModelItem;
  organizationSlug: string;
  workspaceSlug: string;
}

export function ModelDetailView({
  model,
  organizationSlug,
  workspaceSlug,
}: ModelDetailViewProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const base = `/${organizationSlug}/${workspaceSlug}/models`;
  const isAvailable =
    model.isAvailableInWorkspace && model.status !== "disabled";
  const isDeprecated = model.status === "deprecated";

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(model.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setCopiedId(true);
    }
  }

  const curlSnippet = `curl https://api.growxlabs.tech/v1/chat/completions \\
  -H "Authorization: Bearer $GROWX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "messages": [{"role": "user", "content": "Hello via GrowX Gateway!"}]
  }'`;

  async function handleCopyCurl() {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      setCopiedCurl(true);
    }
  }

  return (
    <div className="model-detail-container">
      <div className="detail-breadcrumb">
        <Link href={base} className="back-link">
          ← Back to models
        </Link>
      </div>

      <div className="detail-header-card">
        <div className="detail-header-main">
          <div className="detail-title-wrap">
            <h2 className="detail-title">{model.displayName}</h2>
            <div className="detail-badges">
              <span className="provider-family-tag">{model.family}</span>
              {isAvailable && !isDeprecated ? (
                <span className="status-pill status-healthy">Available</span>
              ) : isDeprecated ? (
                <span className="status-pill status-warning">Deprecated</span>
              ) : (
                <span className="status-pill status-disabled">Unavailable</span>
              )}
            </div>
          </div>

          <div className="prefix-bar">
            <span className="prefix-label">Canonical ID:</span>
            <code className="prefix-code">{model.id}</code>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleCopyId}
            >
              {copiedId ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        <div className="detail-actions">
          <Link
            href={`/${organizationSlug}/${workspaceSlug}/playground?model=${encodeURIComponent(model.id)}`}
            className="btn-primary"
          >
            Test in Playground
          </Link>
        </div>
      </div>

      {isDeprecated ? (
        <div className="alert-warning" role="alert">
          <span className="alert-icon" aria-hidden="true">
            ⚠
          </span>
          <div>
            <strong>Model Deprecation Notice:</strong>{" "}
            {model.deprecationMessage ?? "This model is scheduled for sunset."}
            {model.replacementModelId ? (
              <p className="mt-1">
                Recommended replacement: <code>{model.replacementModelId}</code>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="detail-grid">
        <section className="detail-panel">
          <h3 className="panel-title">Model Specifications</h3>
          <p className="panel-subtitle">{model.description}</p>
          <dl className="metadata-dl">
            <div className="dl-row">
              <dt>Category</dt>
              <dd className="capitalize">{model.category}</dd>
            </div>
            <div className="dl-row">
              <dt>Context Window</dt>
              <dd>
                <code>
                  {model.contextWindow.toLocaleString()} tokens (
                  {model.contextWindowFormatted})
                </code>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Max Output Tokens</dt>
              <dd>
                <code>{model.maxOutputTokens.toLocaleString()} tokens</code>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Input Modalities</dt>
              <dd className="capitalize">{model.inputModalities.join(", ")}</dd>
            </div>
            <div className="dl-row">
              <dt>Output Modalities</dt>
              <dd className="capitalize">
                {model.outputModalities.join(", ")}
              </dd>
            </div>
            <div className="dl-row">
              <dt>Pricing</dt>
              <dd>{model.pricingSummary ?? "Standard catalog rates"}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-panel">
          <h3 className="panel-title">Capability Matrix</h3>
          <p className="panel-subtitle">
            Verified platform runtime features for this model target.
          </p>
          <div className="capabilities-checklist">
            <div
              className={`cap-check-item ${model.supportsStreaming ? "is-supported" : "is-unsupported"}`}
            >
              <span className="cap-icon">
                {model.supportsStreaming ? "✓" : "—"}
              </span>
              <div>
                <strong>Streaming Output</strong>
                <p>
                  Server-sent event token streaming via Phase-7 normalized SSE
                  chunks.
                </p>
              </div>
            </div>
            <div
              className={`cap-check-item ${model.supportsTools ? "is-supported" : "is-unsupported"}`}
            >
              <span className="cap-icon">
                {model.supportsTools ? "✓" : "—"}
              </span>
              <div>
                <strong>Tool & Function Calling</strong>
                <p>
                  Phase-30 normalized tool arguments and schema-validated tool
                  loops.
                </p>
              </div>
            </div>
            <div
              className={`cap-check-item ${model.supportsStructuredOutput ? "is-supported" : "is-unsupported"}`}
            >
              <span className="cap-icon">
                {model.supportsStructuredOutput ? "✓" : "—"}
              </span>
              <div>
                <strong>Structured JSON Output</strong>
                <p>
                  Phase-31 schema-enforced response format with local
                  deterministic verification.
                </p>
              </div>
            </div>
            <div
              className={`cap-check-item ${model.supportsReasoning ? "is-supported" : "is-unsupported"}`}
            >
              <span className="cap-icon">
                {model.supportsReasoning ? "✓" : "—"}
              </span>
              <div>
                <strong>Deep Reasoning & Thinking</strong>
                <p>
                  Extended chain-of-thought token budgeting and reasoning
                  traces.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="detail-panel mt-6">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">API Quickstart</h3>
            <p className="panel-subtitle">
              Execute requests using this model through the GrowX AI Gateway.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={handleCopyCurl}
          >
            {copiedCurl ? "Copied cURL ✓" : "Copy cURL"}
          </button>
        </div>

        <pre className="code-block">
          <code>{curlSnippet}</code>
        </pre>
      </section>
    </div>
  );
}
