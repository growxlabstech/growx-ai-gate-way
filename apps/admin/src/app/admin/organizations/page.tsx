import { AdminShell } from "../../../components/admin-shell";
import { listAdminOrganizations } from "../../../lib/admin-data";
import { AdminOrganizationsView } from "../../../components/admin-organizations-view";

export default async function AdminOrganizationsPage() {
  const orgs = await listAdminOrganizations();

  return (
    <AdminShell
      title="Tenant Organizations"
      description="Manage customer organization boundaries, commercial tiers, and total spend."
    >
      <AdminOrganizationsView initialOrganizations={orgs} />
    </AdminShell>
  );
}
