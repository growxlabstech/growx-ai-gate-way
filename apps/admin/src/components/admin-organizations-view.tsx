"use client";

import { useState } from "react";
import type { AdminOrganizationItem } from "../lib/admin-data";

export function AdminOrganizationsView({
  initialOrganizations,
}: {
  initialOrganizations: AdminOrganizationItem[];
}) {
  const [organizations, setOrganizations] =
    useState<AdminOrganizationItem[]>(initialOrganizations);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrgs = organizations.filter((org) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      org.slug.toLowerCase().includes(q) ||
      org.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-page-container" data-testid="admin-orgs-root">
      <div className="admin-toolbar-row">
        <label className="admin-search-wrap">
          <input
            type="search"
            placeholder="Search organizations by name, slug, or ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-txt-input font-mono"
            style={{ width: "360px" }}
          />
        </label>
        <span className="results-count-tag font-mono">
          {filteredOrgs.length}{" "}
          {filteredOrgs.length === 1 ? "organization" : "organizations"}
        </span>
      </div>

      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {filteredOrgs.length === 0 ? (
          <div className="billing-empty-box">
            <p>No organizations matching "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>ID / Slug</th>
                  <th>Commercial Tier</th>
                  <th>Status</th>
                  <th>Workspaces</th>
                  <th>Members</th>
                  <th className="num-col">Total Spend</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <strong className="font-bold">{org.name}</strong>
                    </td>
                    <td>
                      <code className="font-mono">{org.slug}</code>
                    </td>
                    <td>
                      <span className="badge-success">{org.tier}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${org.status}`}>
                        {org.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono">{org.workspacesCount}</td>
                    <td className="font-mono">{org.membersCount}</td>
                    <td className="num-col font-mono font-bold text-accent-success">
                      {org.totalSpendFormatted}
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
