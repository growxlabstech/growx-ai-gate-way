import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import {
  loadWorkspaceApiKeyBreakdown,
  loadWorkspaceErrorTaxonomy,
  loadWorkspaceModelBreakdown,
  loadWorkspaceTimeSeries,
  loadWorkspaceUsageAnalytics,
  type TimeRangeOption,
} from "../../../../lib/analytics-data";
import { UsageOverviewView } from "../../../../components/analytics/usage-overview-view";

interface UsagePageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
  searchParams?: Promise<{
    range?: string;
  }>;
}

export default async function UsagePage({
  params,
  searchParams,
}: UsagePageProps) {
  const { organizationSlug, workspaceSlug } = await params;
  const sParams = searchParams ? await searchParams : {};
  const timeRange = (sParams.range as TimeRangeOption) ?? "24h";

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

  const [summary, timeseries, models, apiKeys, errors] = await Promise.all([
    loadWorkspaceUsageAnalytics({ organizationId, workspaceId, timeRange }),
    loadWorkspaceTimeSeries({ organizationId, workspaceId, timeRange }),
    loadWorkspaceModelBreakdown({ organizationId, workspaceId, timeRange }),
    loadWorkspaceApiKeyBreakdown({ organizationId, workspaceId }),
    loadWorkspaceErrorTaxonomy({ organizationId, workspaceId }),
  ]);

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Usage & Spend"
      description="Authoritative consumption metrics, latency percentiles, and settled costs for active workspace."
    >
      <UsageOverviewView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        summary={summary}
        timeseries={timeseries}
        models={models}
        apiKeys={apiKeys}
        errors={errors}
      />
    </AppShell>
  );
}
