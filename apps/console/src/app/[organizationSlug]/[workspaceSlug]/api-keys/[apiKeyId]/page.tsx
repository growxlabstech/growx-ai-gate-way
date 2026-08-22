import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { loadTenantContext } from "../../../../../lib/load-tenant-context";
import { loadWorkspaceApiKey } from "../../../../../lib/api-keys-data";
import { ApiKeyDetailView } from "../../../../../components/api-keys/api-key-detail-view";

interface ApiKeyDetailPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
    apiKeyId: string;
  }>;
}

export default async function ApiKeyDetailPage({
  params,
}: ApiKeyDetailPageProps) {
  const { organizationSlug, workspaceSlug, apiKeyId } = await params;
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

  const apiKey = await loadWorkspaceApiKey({
    organizationId,
    workspaceId,
    apiKeyId,
  });

  if (!apiKey) {
    notFound();
  }

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="API Key Details"
    >
      <ApiKeyDetailView
        apiKey={apiKey}
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
      />
    </AppShell>
  );
}
