import { AppShell, StatePanel } from "../../../components/app-shell";
export default async function Page({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell organizationSlug={organizationSlug} title="Organization overview">
      <div className="toolbar">
        <button type="button">Create</button>
        <button type="button">Filter</button>
      </div>
      <StatePanel
        title="Organization overview"
        detail="Identity, access, and workspace activity at a glance."
      />
    </AppShell>
  );
}
