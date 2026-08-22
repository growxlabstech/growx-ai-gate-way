import { AppShell } from "../../../../components/app-shell";
import { loadTenantContext } from "../../../../lib/load-tenant-context";
import { loadWorkspaceBillingSummary } from "../../../../lib/billing-data";
import { BillingOverviewView } from "../../../../components/billing/billing-overview-view";

interface BillingPageProps {
  params: Promise<{
    organizationSlug: string;
    workspaceSlug: string;
  }>;
}

export default async function BillingPage({ params }: BillingPageProps) {
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

  const billingSummary = await loadWorkspaceBillingSummary({
    organizationId,
    workspaceId,
    organizationSlug,
    workspaceSlug,
  });

  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Billing & Credits"
      description="Authoritative credit wallet, spend tracking, transaction history, and verified tax invoices."
    >
      <BillingOverviewView
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        initialSummary={billingSummary}
      />
    </AppShell>
  );
}
