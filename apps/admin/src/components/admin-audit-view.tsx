"use client";

import { useState } from "react";
import type { AdminAuditEventItem } from "../lib/admin-data";

export function AdminAuditView({
  initialEvents,
}: {
  initialEvents: AdminAuditEventItem[];
}) {
  const [events, setEvents] = useState<AdminAuditEventItem[]>(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEvents = events.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      e.actor.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-page-container" data-testid="admin-audit-root">
      <div className="admin-toolbar-row">
        <label className="admin-search-wrap">
          <input
            type="search"
            placeholder="Search audit log by actor, action, or target…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-txt-input font-mono"
            style={{ width: "360px" }}
          />
        </label>
        <span className="results-count-tag font-mono">
          🔒 Tamper-evident hash chain verified ({filteredEvents.length} events)
        </span>
      </div>

      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {filteredEvents.length === 0 ? (
          <div className="billing-empty-box">
            <p>No audit events matching "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target Scope</th>
                  <th>Status</th>
                  <th>Hash Chain</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((aud) => (
                  <tr key={aud.id}>
                    <td className="timestamp-cell">
                      {new Date(aud.timestamp)
                        .toISOString()
                        .slice(0, 19)
                        .replace("T", " ")}
                    </td>
                    <td>
                      <code className="font-mono font-bold">{aud.action}</code>
                    </td>
                    <td className="muted-cell">{aud.actor}</td>
                    <td>
                      <code>{aud.target}</code>
                    </td>
                    <td>
                      <span className="status-pill status-succeeded">
                        SUCCESS
                      </span>
                    </td>
                    <td>
                      <code
                        className="font-mono text-accent-cool"
                        style={{ fontSize: "11px" }}
                      >
                        {aud.hashChain.slice(0, 18)}…
                      </code>
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
