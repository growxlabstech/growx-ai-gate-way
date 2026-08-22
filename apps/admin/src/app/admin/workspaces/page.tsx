import { AdminShell } from "../../../components/admin-shell";
import { listAdminWorkspaces } from "../../../lib/admin-data";
import { AdminWorkspacesView } from "../../../components/admin-workspaces-view";

export default async function AdminWorkspacesPage() {
  const workspaces = await listAdminWorkspaces();

  return (
    <AdminShell
      title="Tenant Workspaces"
      description="Inspect active gateway workspaces, environment isolation, and rate-limit quotas."
    >
      <AdminWorkspacesView initialWorkspaces={workspaces} />
    </AdminShell>
  );
}
