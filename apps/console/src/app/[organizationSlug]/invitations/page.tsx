import { AppShell } from "../../../components/app-shell";
import { loadTenantContext } from "../../../lib/load-tenant-context";
import {
  loadOrganizationMembers,
  loadPendingInvitations,
} from "../../../lib/settings-data";
import { TeamMembersView } from "../../../components/settings/team-members-view";

export default async function OrgInvitationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const contextResult = await loadTenantContext();

  const organization =
    contextResult.status === "ready"
      ? contextResult.context.organizations.find(
          (o) => o.organizationSlug === organizationSlug,
        )
      : undefined;

  const organizationId = organization?.organizationId ?? "org_northstar";

  const [members, invitations] = await Promise.all([
    loadOrganizationMembers({ organizationId }),
    loadPendingInvitations({ organizationId }),
  ]);

  return (
    <AppShell
      organizationSlug={organizationSlug}
      title="Invitations"
      description="Manage pending team invitations and invitation states."
    >
      <TeamMembersView
        organizationSlug={organizationSlug}
        initialMembers={members}
        initialInvitations={invitations}
      />
    </AppShell>
  );
}
