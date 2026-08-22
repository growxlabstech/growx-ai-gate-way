import { AppShell } from "../../../components/app-shell";
import { loadTenantContext } from "../../../lib/load-tenant-context";
import { loadOrganizationSettings } from "../../../lib/settings-data";
import { OrganizationSettingsView } from "../../../components/settings/organization-settings-view";

interface OrgSettingsPageProps {
  params: Promise<{
    organizationSlug: string;
  }>;
}

export default async function OrgSettingsPage({
  params,
}: OrgSettingsPageProps) {
  const { organizationSlug } = await params;
  const contextResult = await loadTenantContext();

  const organization =
    contextResult.status === "ready"
      ? contextResult.context.organizations.find(
          (o) => o.organizationSlug === organizationSlug,
        )
      : undefined;

  const organizationId = organization?.organizationId ?? "org_northstar";

  const settings = await loadOrganizationSettings({
    organizationId,
    organizationSlug,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      title="Organization Settings"
      description="Manage organization profile, canonical identity, and lifecycle governance."
    >
      <OrganizationSettingsView
        organizationSlug={organizationSlug}
        initialSettings={settings}
      />
    </AppShell>
  );
}
