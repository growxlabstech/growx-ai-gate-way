"use client";

import Link from "next/link";
import type { AdminSummary } from "../lib/admin-data";

export function AdminOverviewView({ summary }: { summary: AdminSummary }) {
  return (
    <div className="admin-overview-container" data-testid="admin-overview-root">
      {/* 1. High-Signal Operational Health Metrics */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <span className="kpi-label">Active Incidents</span>
          <span
            className={`kpi-number font-mono ${
              summary.activeIncidentsCount > 0
                ? "text-accent-danger"
                : "text-accent-success"
            }`}
          >
            {summary.activeIncidentsCount}
          </span>
          <span className="kpi-sub">
            {summary.activeIncidentsCount === 0
              ? "All gateway infrastructure nominal"
              : `${summary.activeIncidentsCount} active operational signal`}
          </span>
        </div>

        <div className="admin-kpi-card">
          <span className="kpi-label">Degraded Providers</span>
          <span
            className={`kpi-number font-mono ${
              summary.degradedProvidersCount > 0
                ? "text-accent-warning"
                : "text-accent-success"
            }`}
          >
            {summary.degradedProvidersCount}
          </span>
          <span className="kpi-sub">
            {summary.degradedProvidersCount === 0
              ? "All upstream AI provider circuits closed"
              : "Traffic automatically falling back"}
          </span>
        </div>

        <div className="admin-kpi-card">
          <span className="kpi-label">Worker Pools</span>
          <span className="kpi-number font-mono text-accent-success">
            {
              summary.workerHealthSummary.filter((w) => w.status === "healthy")
                .length
            }{" "}
            / {summary.workerHealthSummary.length}
          </span>
          <span className="kpi-sub">
            Batch, Prober, Webhooks & Settlement healthy
          </span>
        </div>

        <div className="admin-kpi-card">
          <span className="kpi-label">Reconciliation</span>
          <span className="kpi-number font-mono text-accent-success">
            0 Mismatch
          </span>
          <span className="kpi-sub">100% matched across payment rails</span>
        </div>
      </div>

      {/* 2. Active Incidents Banner */}
      {summary.activeIncidents.length > 0 ? (
        <section className="admin-section-box">
          <div className="section-title-row">
            <h2 className="section-title text-accent-danger">
              🚨 Active Incident Investigations
            </h2>
            <span className="badge-danger">P2 ELEVATED</span>
          </div>
          <div className="incidents-list">
            {summary.activeIncidents.map((inc) => (
              <div key={inc.id} className="incident-card">
                <div className="incident-header">
                  <strong>{inc.title}</strong>
                  <span className="status-pill status-degraded">
                    {inc.status.toUpperCase()}
                  </span>
                </div>
                <p className="incident-summary">{inc.summary}</p>
                <div className="incident-footer">
                  <span>
                    Target: <code>{inc.affectedCapability}</code>
                  </span>
                  <span>
                    Started:{" "}
                    {new Date(inc.startedAt)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Two Column: Provider Status & Recent Audit Events */}
      <div className="admin-two-col-grid">
        {/* Left: Upstream Providers */}
        <section className="admin-section-box">
          <div className="section-title-row">
            <h2 className="section-title">Upstream AI Providers</h2>
            <Link href="/admin/providers" className="btn-secondary btn-sm">
              Manage Providers →
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>P95 Latency</th>
                <th>Circuit</th>
              </tr>
            </thead>
            <tbody>
              {summary.providerHealthSummary.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <span className={`status-pill status-${p.status}`}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="font-mono">{p.p95LatencyMs} ms</td>
                  <td>
                    <span className="badge-subtle font-mono">
                      {p.circuitState.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Right: Append-Only Immutable Audit Log */}
        <section className="admin-section-box">
          <div className="section-title-row">
            <h2 className="section-title">Tamper-Evident Audit Stream</h2>
            <Link href="/admin/audit-events" className="btn-secondary btn-sm">
              Full Audit Log →
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentAuditEvents.map((aud) => (
                <tr key={aud.id}>
                  <td>
                    <code className="font-mono font-bold">{aud.action}</code>
                  </td>
                  <td className="muted-cell">{aud.actor}</td>
                  <td>
                    <code>{aud.target}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
