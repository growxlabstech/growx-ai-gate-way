import { notFound, redirect } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { loadTenantContext } from "../../../../../lib/load-tenant-context";
import { loadWorkspaceModel } from "../../../../../lib/models-data";
import { workspacesForOrganization } from "../../../../../lib/tenant-context";
import { ModelDetailView } from "../../../../../components/models/model-detail-view";

interface ModelDetailPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
    modelId: string;
  }>;
}

export default async function ModelDetailPage({
  params,
}: ModelDetailPageProps) {
  const { organizationSlug, workspaceSlug, modelId } = await params;
  const tenant = await loadTenantContext();

  if (tenant.status === "unauthenticated") {
    redirect(
      `/sign-in?returnTo=/${organizationSlug}/${workspaceSlug}/models/${modelId}`,
    );
  }
  if (tenant.status === "empty") {
    redirect("/onboarding");
  }
  if (tenant.status === "error") {
    return (
      <main className="shell-failure">
        <section className="state" role="alert">
          <div>
            <h1>Workspace context unavailable</h1>
            <p>
              GrowX could not safely load your organization and workspace
              access.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const activeOrg = tenant.context.organizations.find(
    (org) =>
      org.organizationSlug === organizationSlug && org.status === "active",
  );
  if (!activeOrg) notFound();

  const availableWorkspaces = workspacesForOrganization(
    tenant.context,
    activeOrg.organizationId,
  );
  const activeWorkspace = availableWorkspaces.find(
    (ws) => ws.workspaceSlug === workspaceSlug,
  );
  if (!activeWorkspace) notFound();

  const model = await loadWorkspaceModel({
    organizationId: activeOrg.organizationId,
    workspaceId: activeWorkspace.workspaceId,
    modelId,
  });

  if (!model) {
    notFound();
  }

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Model Details"
    >
      <ModelDetailView
        model={model}
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
      />
    </AppShell>
  );
}
