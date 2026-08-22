import { AdminShell } from "../../../components/admin-shell";
import { listAdminAuditEvents } from "../../../lib/admin-data";
import { AdminAuditView } from "../../../components/admin-audit-view";

export default async function AdminAuditEventsPage() {
  const events = await listAdminAuditEvents();

  return (
    <AdminShell
      title="Append-Only Immutable Audit Log"
      description="Cryptographically verifiable SHA-256 hash-chained log of all privileged operator actions."
    >
      <AdminAuditView initialEvents={events} />
    </AdminShell>
  );
}
