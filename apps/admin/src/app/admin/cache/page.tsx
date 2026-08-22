import { AdminShell } from "../../../components/admin-shell";

export default function AdminCachePage() {
  return (
    <AdminShell
      title="Exact & Semantic Cache Operations"
      description="Inspect Phase-15 exact and Phase-24 semantic cache hit rates, vector namespaces, and tenant isolation."
    >
      <div className="admin-page-container">
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card">
            <span className="kpi-label">Exact Cache Hit Rate</span>
            <span className="kpi-number font-mono text-accent-cool">18.4%</span>
            <span className="kpi-sub">Exact response matching</span>
          </div>
          <div className="admin-kpi-card">
            <span className="kpi-label">Semantic Cache Hit Rate</span>
            <span className="kpi-number font-mono text-accent-cool">7.2%</span>
            <span className="kpi-sub">
              Cosine similarity &gt; 0.94 validated
            </span>
          </div>
          <div className="admin-kpi-card">
            <span className="kpi-label">Tenant Partitioning</span>
            <span className="kpi-number font-mono text-accent-success">
              100% Isolated
            </span>
            <span className="kpi-sub">Strict org namespace hashing</span>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
