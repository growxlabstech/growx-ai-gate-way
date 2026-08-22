import { AdminShell } from "../../../components/admin-shell";
import { listAdminSecurityEvents } from "../../../lib/admin-data";
import { AdminSecurityView } from "../../../components/admin-security-view";

export default async function AdminSecurityEventsPage() {
  const events = await listAdminSecurityEvents();

  return (
    <AdminShell
      title="Security Operations & Signals"
      description="Automated intrusion detection, anomalous rate-limit spikes, and suspicious IP telemetry."
    >
      <AdminSecurityView initialEvents={events} />
    </AdminShell>
  );
}
