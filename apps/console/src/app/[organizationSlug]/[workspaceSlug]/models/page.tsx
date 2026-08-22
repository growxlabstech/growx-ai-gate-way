import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceModels } from "../../../../lib/models-data";
import { ModelCatalogGrid } from "../../../../components/models/model-catalog-grid";

interface ModelsPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function ModelsPage({ params }: ModelsPageProps) {
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

  const models = await loadWorkspaceModels({
    organizationId,
    workspaceId,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Models"
      description="Discover canonical models, multimodal capabilities, context windows, and availability."
    >
      <ModelCatalogGrid
        initialModels={models}
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
      />
    </AppShell>
  );
}
