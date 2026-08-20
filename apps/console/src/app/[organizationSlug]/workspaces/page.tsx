import { AppShell, StatePanel } from "../../../components/app-shell";

export default async function Page({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const createAction = <button className="primary" type="button">Create workspace</button>;
  return <AppShell organizationSlug={organizationSlug} title="Workspaces" description="Manage environments, access and usage boundaries." action={createAction}>
    <div className="toolbar workspace-toolbar"><label className="search-field"><span className="sr-only">Search workspaces</span><input type="search" placeholder="Search workspaces…" /></label><select aria-label="Filter by status" defaultValue="all"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select><select aria-label="Filter by environment" defaultValue="all"><option value="all">All environments</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></select></div>
    <StatePanel title="No workspaces yet" detail="Create your first workspace to organize environments, API keys, usage and routing." action={<button className="secondary" type="button">Create workspace</button>} />
  </AppShell>;
}
