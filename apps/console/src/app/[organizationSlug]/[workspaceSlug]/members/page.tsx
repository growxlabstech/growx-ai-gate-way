import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import {
  loadOrganizationMembers,
  loadPendingInvitations,
} from "../../../../lib/settings-data";
import { TeamMembersView } from "../../../../components/settings/team-members-view";

interface WorkspaceMembersPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function WorkspaceMembersPage({
  params,
}: WorkspaceMembersPageProps) {
  const { organizationSlug, workspaceSlug } = await params;
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
      workspaceSlug={workspaceSlug}
      title="Workspace Members"
      description="Manage workspace memberships, RBAC access roles, and pending invitations."
    >
      <TeamMembersView
        organizationSlug={organizationSlug}
        initialMembers={members}
        initialInvitations={invitations}
      />
    </AppShell>
  );
}
