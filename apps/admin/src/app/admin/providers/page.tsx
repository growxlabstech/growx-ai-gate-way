import { AdminShell } from "../../../components/admin-shell";
import { listAdminProviders } from "../../../lib/admin-data";
import { AdminProvidersView } from "../../../components/admin-providers-view";

export default async function AdminProvidersPage() {
  const providers = await listAdminProviders();

  return (
    <AdminShell
      title="Upstream AI Providers"
      description="Manage provider accounts, circuit breaker states, drain controls, and safe credential rotation."
    >
      <AdminProvidersView initialProviders={providers} />
    </AdminShell>
  );
}
