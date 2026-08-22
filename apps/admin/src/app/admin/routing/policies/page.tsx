import { AdminShell } from "../../../../components/admin-shell";
import { listAdminRoutingPolicies } from "../../../../lib/admin-data";
import { AdminRoutingView } from "../../../../components/admin-routing-view";

export default async function AdminRoutingPoliciesPage() {
  const policies = await listAdminRoutingPolicies();
  return (
    <AdminShell
      title="Intelligent Routing Policies"
      description="Strategy configuration for Latency, Cost, Reliability, and Locality multi-objective optimization."
    >
      <AdminRoutingView initialPolicies={policies} />
    </AdminShell>
  );
}
