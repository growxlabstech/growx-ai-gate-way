import { AdminShell } from "../../../components/admin-shell";
import { listAdminRoutingPolicies } from "../../../lib/admin-data";
import { AdminRoutingView } from "../../../components/admin-routing-view";

export default async function AdminRoutingPage() {
  const policies = await listAdminRoutingPolicies();

  return (
    <AdminShell
      title="Router V2 Policies & Traffic"
      description="Inspect intelligent traffic routing targets, fallback sequences, and hysteresis stability penalties."
    >
      <AdminRoutingView initialPolicies={policies} />
    </AdminShell>
  );
}
