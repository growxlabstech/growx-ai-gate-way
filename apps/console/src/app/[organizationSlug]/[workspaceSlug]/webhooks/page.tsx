import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWebhookEndpoints } from "../../../../lib/settings-data";
import { WebhooksSettingsView } from "../../../../components/settings/webhooks-settings-view";

interface WorkspaceWebhooksPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function WorkspaceWebhooksPage({
  params,
}: WorkspaceWebhooksPageProps) {
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

  const endpoints = await loadWebhookEndpoints({
    organizationId,
    workspaceId,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Webhooks"
      description="Manage HTTPS webhook listeners signed with HMAC-SHA256 and replay protection."
    >
      <WebhooksSettingsView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        initialEndpoints={endpoints}
      />
    </AppShell>
  );
}
