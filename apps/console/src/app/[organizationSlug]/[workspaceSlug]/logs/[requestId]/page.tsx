import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { loadTenantContext } from "../../../../../lib/load-tenant-context";
import { loadWorkspaceRequestDetail } from "../../../../../lib/analytics-data";
import { RequestDetailView } from "../../../../../components/analytics/request-detail-view";

export const dynamic = "force-dynamic";

interface RequestDetailPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
    requestId: string;
  }>;
}

export default async function RequestDetailPage({
  params,
}: RequestDetailPageProps) {
  const { organizationSlug, workspaceSlug, requestId } = await params;

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

  const detail = await loadWorkspaceRequestDetail({
    organizationId,
    workspaceId,
    organizationSlug,
    workspaceSlug,
    requestId,
  });

  if (!detail) {
    notFound();
  }

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Request Detail"
      description={`Deep execution analysis and telemetry for request ${requestId}`}
    >
      <RequestDetailView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        detail={detail}
      />
    </AppShell>
  );
}
