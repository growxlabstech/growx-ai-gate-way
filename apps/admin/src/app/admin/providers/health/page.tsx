import { AdminShell } from "../../../../components/admin-shell";
import { listAdminProviders } from "../../../../lib/admin-data";
import { AdminProvidersView } from "../../../../components/admin-providers-view";

export default async function AdminProvidersHealthPage() {
  const providers = await listAdminProviders();
  return (
    <AdminShell
      title="Provider Health & Circuit Status"
      description="Live P95 latency metrics, error rates, and automated circuit breaker states."
    >
      <AdminProvidersView initialProviders={providers} />
    </AdminShell>
  );
}
