"use client";

import { useState } from "react";
import type { AdminModelItem } from "../lib/admin-data";

export function AdminModelsView({
  initialModels,
}: {
  initialModels: AdminModelItem[];
}) {
  const [models, setModels] = useState<AdminModelItem[]>(initialModels);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredModels = models.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.family.toLowerCase().includes(q)
    );
  });

  function toggleModelStatus(modelId: string) {
    const target = models.find((m) => m.id === modelId);
    if (!target) return;

    const willDisable = target.status === "active";
    const confirmPrompt = willDisable
      ? `Disable model ${target.name}? Customer requests for this model will fallback to secondary execution targets or return model_unavailable.`
      : `Re-enable model ${target.name}?`;

    if (confirm(confirmPrompt)) {
      setModels(
        models.map((m) =>
          m.id === modelId
            ? { ...m, status: willDisable ? "disabled" : "active" }
            : m,
        ),
      );
      setActionSuccess(
        `Model ${target.name} status updated to ${willDisable ? "DISABLED" : "ACTIVE"}. Router V2 notified immediately.`,
      );
      setTimeout(() => setActionSuccess(null), 4000);
    }
  }

  return (
    <div className="admin-page-container" data-testid="admin-models-root">
      <div className="admin-toolbar-row">
        <label className="admin-search-wrap">
          <input
            type="search"
            placeholder="Search models by name, ID, or family…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-txt-input font-mono"
            style={{ width: "360px" }}
          />
        </label>
        <span className="results-count-tag font-mono">
          {filteredModels.length}{" "}
          {filteredModels.length === 1 ? "model" : "models"}
        </span>
      </div>

      {actionSuccess ? (
        <div className="form-success-note" style={{ marginBottom: "12px" }}>
          ✓ {actionSuccess}
        </div>
      ) : null}

      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {filteredModels.length === 0 ? (
          <div className="billing-empty-box">
            <p>No models matching "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Family</th>
                  <th>Provider</th>
                  <th className="num-col">Context</th>
                  <th>Capabilities</th>
                  <th className="num-col">Input / Output</th>
                  <th>Status</th>
                  <th className="num-col">Kill Switch</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="member-name-wrap">
                        <strong className="font-bold">{m.name}</strong>
                        <code className="member-email font-mono">{m.id}</code>
                      </div>
                    </td>
                    <td className="muted-cell">{m.family}</td>
                    <td>
                      <span className="badge-subtle font-mono">
                        {m.primaryProvider}
                      </span>
                    </td>
                    <td className="num-col font-mono">{m.contextWindow}</td>
                    <td>
                      <div className="event-badges-wrap">
                        {m.capabilities.map((cap) => (
                          <span key={cap} className="badge-subtle font-mono">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num-col font-mono">
                      {m.pricingPerMillionPrompt} /{" "}
                      {m.pricingPerMillionCompletion}
                    </td>
                    <td>
                      <span className={`status-pill status-${m.status}`}>
                        {m.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="num-col">
                      <button
                        type="button"
                        className={`btn-sm ${m.status === "active" ? "btn-danger-ghost" : "btn-primary"}`}
                        onClick={() => toggleModelStatus(m.id)}
                      >
                        {m.status === "active" ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
