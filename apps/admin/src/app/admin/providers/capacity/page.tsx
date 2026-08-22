import { AdminShell } from "../../../../components/admin-shell";
import { listAdminProviders } from "../../../../lib/admin-data";
import { AdminProvidersView } from "../../../../components/admin-providers-view";

export default async function AdminProvidersCapacityPage() {
  const providers = await listAdminProviders();
  return (
    <AdminShell
      title="Provider Account Quotas & Capacity"
      description="Inspect multi-account provider pooling and capacity constraints."
    >
      <AdminProvidersView initialProviders={providers} />
    </AdminShell>
  );
}
