"use client";

import { useState } from "react";
import type { AdminWorkspaceItem } from "../lib/admin-data";

export function AdminWorkspacesView({
  initialWorkspaces,
}: {
  initialWorkspaces: AdminWorkspaceItem[];
}) {
  const [workspaces, setWorkspaces] =
    useState<AdminWorkspaceItem[]>(initialWorkspaces);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ws.name.toLowerCase().includes(q) ||
      ws.slug.toLowerCase().includes(q) ||
      ws.organizationId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-page-container" data-testid="admin-workspaces-root">
      <div className="admin-toolbar-row">
        <label className="admin-search-wrap">
          <input
            type="search"
            placeholder="Search workspaces by name, slug, or organization ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-txt-input font-mono"
            style={{ width: "360px" }}
          />
        </label>
        <span className="results-count-tag font-mono">
          {filteredWorkspaces.length}{" "}
          {filteredWorkspaces.length === 1 ? "workspace" : "workspaces"}
        </span>
      </div>

      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {filteredWorkspaces.length === 0 ? (
          <div className="billing-empty-box">
            <p>No workspaces matching "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Organization</th>
                  <th>Environment</th>
                  <th>Data Retention</th>
                  <th className="num-col">RPM Limit</th>
                  <th className="num-col">TPM Limit</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkspaces.map((ws) => (
                  <tr key={ws.id}>
                    <td>
                      <div className="member-name-wrap">
                        <span className="member-name font-bold">{ws.name}</span>
                        <code className="member-email font-mono">{ws.id}</code>
                      </div>
                    </td>
                    <td>
                      <code className="font-mono">{ws.organizationId}</code>
                    </td>
                    <td>
                      <span className="badge-subtle font-mono">
                        {ws.environment.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge-subtle ${
                          ws.dataRetention === "zero_retention"
                            ? "badge-success"
                            : ""
                        }`}
                      >
                        {ws.dataRetention === "zero_retention"
                          ? "Zero Retention"
                          : "Standard"}
                      </span>
                    </td>
                    <td className="num-col font-mono">
                      {ws.rpmQuota.toLocaleString()}
                    </td>
                    <td className="num-col font-mono">
                      {ws.tpmQuota.toLocaleString()}
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
