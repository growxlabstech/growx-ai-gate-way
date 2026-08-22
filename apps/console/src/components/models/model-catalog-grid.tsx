"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsoleModelItem } from "../../lib/models-data";

interface ModelCatalogGridProps {
  initialModels: ConsoleModelItem[];
  organizationSlug: string;
  workspaceSlug: string;
}

export function ModelCatalogGrid({
  initialModels,
  organizationSlug,
  workspaceSlug,
}: ModelCatalogGridProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const base = `/${organizationSlug}/${workspaceSlug}/models`;

  const filters = [
    { id: "all", label: "All Models" },
    { id: "chat", label: "Chat & Responses" },
    { id: "reasoning", label: "Reasoning" },
    { id: "vision", label: "Vision" },
    { id: "tools", label: "Tool Calling" },
    { id: "structured_output", label: "Structured Output" },
    { id: "embeddings", label: "Embeddings" },
  ];

  const filteredModels = initialModels.filter((model) => {
    // Search query
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      const match =
        model.id.toLowerCase().includes(term) ||
        model.displayName.toLowerCase().includes(term) ||
        model.family.toLowerCase().includes(term) ||
        model.description.toLowerCase().includes(term);
      if (!match) return false;
    }

    // Capability filter
    if (activeFilter !== "all") {
      if (activeFilter === "chat" && model.category !== "chat") return false;
      if (activeFilter === "reasoning" && !model.supportsReasoning)
        return false;
      if (activeFilter === "vision" && !model.inputModalities.includes("image"))
        return false;
      if (activeFilter === "tools" && !model.supportsTools) return false;
      if (
        activeFilter === "structured_output" &&
        !model.supportsStructuredOutput
      )
        return false;
      if (activeFilter === "embeddings" && model.category !== "embeddings")
        return false;
    }

    // Availability filter
    if (availabilityOnly) {
      if (!model.isAvailableInWorkspace || model.status === "disabled")
        return false;
    }

    return true;
  });

  async function handleCopyId(modelId: string) {
    try {
      await navigator.clipboard.writeText(modelId);
      setCopiedId(modelId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(modelId);
    }
  }

  return (
    <div className="models-catalog-container">
      <div className="models-filter-toolbar">
        <div className="models-search-row">
          <input
            type="search"
            placeholder="Search canonical model ID, provider, or capability…"
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search models"
          />

          <label className="availability-checkbox-label">
            <input
              type="checkbox"
              checked={availabilityOnly}
              onChange={(e) => setAvailabilityOnly(e.target.checked)}
            />
            <span>Available only</span>
          </label>
        </div>

        <div
          className="filter-pills-row"
          role="tablist"
          aria-label="Filter models by capability"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === f.id}
              className={`filter-pill ${activeFilter === f.id ? "is-active" : ""}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-responsive">
        <table className="overview-data-table models-table">
          <thead>
            <tr>
              <th>Canonical Model ID</th>
              <th>Provider</th>
              <th>Context</th>
              <th>Max Output</th>
              <th>Capabilities</th>
              <th>Pricing (est.)</th>
              <th>Status</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty-row">
                  No models match your current search and capability filters.
                </td>
              </tr>
            ) : (
              filteredModels.map((model) => {
                const isAvailable =
                  model.isAvailableInWorkspace && model.status !== "disabled";
                const isDeprecated = model.status === "deprecated";
                const isDisabled = model.status === "disabled";

                return (
                  <tr
                    key={model.id}
                    className={isDisabled ? "row-disabled" : undefined}
                  >
                    <td>
                      <div className="model-id-cell">
                        <Link
                          href={`${base}/${encodeURIComponent(model.id)}`}
                          className="model-id-link"
                          title={`View details for ${model.displayName}`}
                        >
                          <code className="model-id-code">{model.id}</code>
                        </Link>
                        <button
                          type="button"
                          className="btn-copy-icon"
                          onClick={() => handleCopyId(model.id)}
                          aria-label={`Copy model ID ${model.id}`}
                        >
                          {copiedId === model.id ? "✓" : "❐"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="provider-family-tag">
                        {model.family}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm">
                        {model.contextWindowFormatted}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-secondary">
                        {model.maxOutputTokensFormatted}
                      </span>
                    </td>
                    <td>
                      <div className="capabilities-badges-wrap">
                        {model.supportsStreaming ? (
                          <span className="cap-badge">Stream</span>
                        ) : null}
                        {model.supportsTools ? (
                          <span className="cap-badge">Tools</span>
                        ) : null}
                        {model.supportsStructuredOutput ? (
                          <span className="cap-badge">JSON</span>
                        ) : null}
                        {model.supportsReasoning ? (
                          <span className="cap-badge">Reason</span>
                        ) : null}
                        {model.inputModalities.includes("image") ? (
                          <span className="cap-badge">Vision</span>
                        ) : null}
                        {model.category === "embeddings" ? (
                          <span className="cap-badge">Vectors</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-secondary text-xs">
                      {model.pricingSummary ?? "Standard"}
                    </td>
                    <td>
                      {isAvailable && !isDeprecated ? (
                        <span className="status-pill status-healthy">
                          Available
                        </span>
                      ) : isDeprecated ? (
                        <span
                          className="status-pill status-warning"
                          title={model.deprecationMessage ?? "Deprecated"}
                        >
                          Deprecated
                        </span>
                      ) : (
                        <span
                          className="status-pill status-disabled"
                          title={
                            model.unavailableReason ??
                            "Unavailable in workspace"
                          }
                        >
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td className="td-actions">
                      <Link
                        href={`${base}/${encodeURIComponent(model.id)}`}
                        className="btn-action-ghost"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
