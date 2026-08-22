import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceSettings } from "../../../../lib/settings-data";
import { WorkspaceSettingsView } from "../../../../components/settings/workspace-settings-view";

interface WorkspaceSettingsPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function WorkspaceSettingsPage({
  params,
}: WorkspaceSettingsPageProps) {
  const { organizationSlug, workspaceSlug } = await params;
  const contextResult = await loadTenantContext();

  const organization =
    contextResult.status === "ready"
      ? contextResult.context.organizations.find(
          (o) => o.organizationSlug === organizationSlug,
        )
      : undefined;

  const workspace =
    contextResult.status === "ready"
      ? contextResult.context.workspaces.find(
          (w) =>
            w.workspaceSlug === workspaceSlug &&
            (!organization || w.organizationId === organization.organizationId),
        )
      : undefined;

  const workspaceId = workspace?.workspaceId ?? "ws_production";
  const organizationId = organization?.organizationId ?? "org_northstar";

  const settings = await loadWorkspaceSettings({
    organizationId,
    workspaceId,
    workspaceSlug,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Workspace Settings"
      description="Manage workspace identity, environment boundaries, and Phase-35 governance policies."
    >
      <WorkspaceSettingsView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        initialSettings={settings}
      />
    </AppShell>
  );
}
