import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceApiKeys } from "../../../../lib/api-keys-data";
import { ApiKeysManager } from "../../../../components/api-keys/api-keys-manager";

interface ApiKeysPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function ApiKeysPage({ params }: ApiKeysPageProps) {
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

  const keys = await loadWorkspaceApiKeys({
    organizationId,
    workspaceId,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="API keys"
      description="Create, monitor, and revoke machine credentials for the GrowX AI Gateway."
    >
      <ApiKeysManager
        initialKeys={keys}
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
      />
    </AppShell>
  );
}
