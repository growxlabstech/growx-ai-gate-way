import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceOverview } from "../../../../lib/overview-data";
import { WorkspaceSummaryGrid } from "../../../../components/dashboard/workspace-summary-grid";
import { UsageTrendChart } from "../../../../components/dashboard/usage-trend-chart";
import { ModelActivityTable } from "../../../../components/dashboard/model-activity-table";
import { RecentRequestsStream } from "../../../../components/dashboard/recent-requests-stream";
import { FirstRunBanner } from "../../../../components/dashboard/first-run-banner";

export default async function WorkspaceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; workspaceSlug: string }>;
  searchParams?: Promise<{ period?: "24h" | "7d" | "30d" }>;
}) {
  const { organizationSlug, workspaceSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const period = resolvedSearchParams.period ?? "24h";

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

  const data = await loadWorkspaceOverview({
    organizationSlug,
    workspaceSlug,
    organizationId: organization?.organizationId ?? "org_northstar",
    workspaceId: workspace?.workspaceId ?? "ws_production",
    period,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Workspace overview"
      description="Real-time health, request volume, token usage, and credit balance."
    >
      <div className="overview-container">
        {data.isFirstRun && (
          <FirstRunBanner
            organizationSlug={organizationSlug}
            workspaceSlug={workspaceSlug}
          />
        )}

        <WorkspaceSummaryGrid
          metrics={data.metrics}
          financials={data.financials}
          organizationSlug={organizationSlug}
          workspaceSlug={workspaceSlug}
        />

        <UsageTrendChart timeseries={data.timeseries} period={data.period} />

        <div className="overview-two-col">
          <ModelActivityTable
            models={data.topModels}
            organizationSlug={organizationSlug}
            workspaceSlug={workspaceSlug}
          />
          <RecentRequestsStream
            requests={data.recentRequests}
            organizationSlug={organizationSlug}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>
    </AppShell>
  );
}
