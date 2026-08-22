import { AppShell, StatePanel } from "../../../../components/app-shell";
export default async function Page({
  params,
}: {
  params: Promise<{ organizationSlug: string; workspaceSlug: string }>;
}) {
  const { organizationSlug, workspaceSlug } = await params;
  return (
    <AppShell
      organizationSlug={organizationSlug}
      workspaceSlug={workspaceSlug}
      title="Service accounts"
    >
      <StatePanel
        title="No service accounts"
        detail="Create least-privilege non-human identities for CI/CD, backend services, and automation."
      />
    </AppShell>
  );
}
