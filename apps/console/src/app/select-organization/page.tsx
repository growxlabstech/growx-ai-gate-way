import Link from "next/link";
import { redirect } from "next/navigation";
import { loadTenantContext } from "../../lib/load-tenant-context";
import { workspacesForOrganization } from "../../lib/tenant-context";

export default async function SelectOrganizationPage() {
  const result = await loadTenantContext();
  if (result.status === "unauthenticated") redirect("/sign-in?returnTo=/select-organization");
  if (result.status === "empty") redirect("/onboarding");
  if (result.status === "error") return <main className="picker"><p className="eyebrow">ORGANIZATIONS</p><h1>Context unavailable</h1><p className="muted">GrowX could not safely load your organizations. Try again when the identity service is available.</p><a className="retry-link" href="">Retry</a></main>;

  return <main className="picker">
    <p className="eyebrow">YOUR ORGANIZATIONS</p>
    <h1>Choose where to work</h1>
    <div className="organization-list">{result.context.organizations.map((organization) => {
      const workspaces = workspacesForOrganization(result.context, organization.organizationId);
      const destination = workspaces[0] ? `/${organization.organizationSlug}/${workspaces[0].workspaceSlug}/overview` : `/${organization.organizationSlug}/overview`;
      return <Link className="resource-row" href={destination} key={organization.organizationId}><span><strong>{organization.organizationName}</strong><small>{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}</small></span><span>Open</span></Link>;
    })}</div>
  </main>;
}
