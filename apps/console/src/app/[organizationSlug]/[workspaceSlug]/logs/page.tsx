import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceModels } from "../../../../lib/models-data";
import {
  loadWorkspaceRequestHistory,
  type RequestHistoryFilterOptions,
  type RequestStatusFilter,
  type TimeRangeOption,
} from "../../../../lib/analytics-data";
import { RequestHistoryView } from "../../../../components/analytics/request-history-view";

interface LogsPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
  searchParams?: Promise<{
    model?: string;
    status?: string;
    apiKeyId?: string;
    search?: string;
    range?: string;
    cursor?: string;
  }>;
}

export default async function LogsPage({
  params,
  searchParams,
}: LogsPageProps) {
  const { organizationSlug, workspaceSlug } = await params;
  const sParams = searchParams ? await searchParams : {};

  const initialFilters: RequestHistoryFilterOptions = {
    model: sParams.model,
    status: sParams.status as RequestStatusFilter,
    apiKeyId: sParams.apiKeyId,
    search: sParams.search,
    timeRange: sParams.range as TimeRangeOption,
    cursor: sParams.cursor,
  };

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

  const [historyPage, models] = await Promise.all([
    loadWorkspaceRequestHistory({
      organizationId,
      workspaceId,
      filters: initialFilters,
    }),
    loadWorkspaceModels({
      organizationId,
      workspaceId,
    }),
  ]);

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Request Logs"
      description="Inspect real Gateway execution history, latency percentiles, and token consumption."
    >
      <RequestHistoryView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        historyPage={historyPage}
        models={models}
        initialFilters={initialFilters}
      />
    </AppShell>
  );
}
