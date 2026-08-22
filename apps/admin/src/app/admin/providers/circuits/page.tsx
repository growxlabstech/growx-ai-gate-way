import { AdminShell } from "../../../../components/admin-shell";
import { listAdminProviders } from "../../../../lib/admin-data";
import { AdminProvidersView } from "../../../../components/admin-providers-view";

export default async function AdminProvidersCircuitsPage() {
  const providers = await listAdminProviders();
  return (
    <AdminShell
      title="Provider Circuit Breakers"
      description="Manage circuit trip thresholds, half-open recovery probes, and manual drain controls."
    >
      <AdminProvidersView initialProviders={providers} />
    </AdminShell>
  );
}
