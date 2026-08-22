import { AdminShell } from "../../../components/admin-shell";
import { listAdminUsers } from "../../../lib/admin-data";
import { AdminUsersView } from "../../../components/admin-users-view";

export default async function AdminUsersPage() {
  const users = await listAdminUsers();

  return (
    <AdminShell
      title="Global User Management"
      description="Privileged cross-tenant user lookup, MFA status, role inspection, and account suspension."
    >
      <AdminUsersView initialUsers={users} />
    </AdminShell>
  );
}
