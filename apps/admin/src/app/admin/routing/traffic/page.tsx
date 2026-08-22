import { AdminShell } from "../../../../components/admin-shell";
import { listAdminRoutingPolicies } from "../../../../lib/admin-data";
import { AdminRoutingView } from "../../../../components/admin-routing-view";

export default async function AdminRoutingTrafficPage() {
  const policies = await listAdminRoutingPolicies();
  return (
    <AdminShell
      title="Traffic Allocation & Canary Splitting"
      description="Inspect active traffic allocation and dynamic route weights."
    >
      <AdminRoutingView initialPolicies={policies} />
    </AdminShell>
  );
}
