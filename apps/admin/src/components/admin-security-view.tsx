"use client";

import { useState } from "react";
import type { AdminSecurityEventItem } from "../lib/admin-data";

export function AdminSecurityView({
  initialEvents,
}: {
  initialEvents: AdminSecurityEventItem[];
}) {
  const [events, setEvents] = useState<AdminSecurityEventItem[]>(initialEvents);

  return (
    <div className="admin-page-container" data-testid="admin-security-root">
      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        <div className="table-responsive-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Incident Type</th>
                <th>Target Scope</th>
                <th>Status</th>
                <th>Signal Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((sec) => (
                <tr key={sec.id}>
                  <td className="timestamp-cell">
                    {new Date(sec.timestamp)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        sec.severity === "high" || sec.severity === "critical"
                          ? "status-failed"
                          : "status-degraded"
                      }`}
                    >
                      {sec.severity.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <code className="font-mono font-bold">{sec.type}</code>
                  </td>
                  <td>
                    <code>{sec.targetOrg}</code>
                  </td>
                  <td>
                    <span className="badge-subtle font-mono">
                      {sec.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="tx-desc-text">{sec.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
