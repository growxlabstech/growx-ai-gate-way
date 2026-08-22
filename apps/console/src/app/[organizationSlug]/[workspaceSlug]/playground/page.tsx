import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceModels } from "../../../../lib/models-data";
import { PlaygroundView } from "../../../../components/playground/playground-view";

interface PlaygroundPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function PlaygroundPage({ params }: PlaygroundPageProps) {
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
      title="Playground"
      description="Interactive gateway execution testbed with realtime streaming, parameters, tools, and metering."
    >
      <PlaygroundView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        models={models}
      />
    </AppShell>
  );
}
