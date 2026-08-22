import { AdminShell } from "../../components/admin-shell";
import { loadAdminSummary } from "../../lib/admin-data";
import { AdminOverviewView } from "../../components/admin-overview-view";

export default async function AdminHomePage() {
  const summary = await loadAdminSummary();

  return (
    <AdminShell
      title="Platform Operations Overview"
      description="Live operational telemetry, active incidents, degraded provider circuits, and audit streams."
    >
      <AdminOverviewView summary={summary} />
    </AdminShell>
  );
}
