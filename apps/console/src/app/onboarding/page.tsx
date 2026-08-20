import { redirect } from "next/navigation";
import { loadTenantContext } from "../../lib/load-tenant-context";
import { accountState, resolveAccountDestination } from "../../lib/auth-flow";

export default async function Page() {
  const result = await loadTenantContext();
  if (result.status === "unauthenticated") redirect("/sign-in?returnTo=%2Fonboarding");
  if (result.status === "error") return <main className="onboarding-shell"><section className="onboarding-card" role="alert"><p className="eyebrow">Account setup</p><h1>Context unavailable</h1><p>GrowX could not safely resolve your account state. No organization or workspace was created.</p><a className="auth-primary onboarding-retry" href="/onboarding">Retry</a></section></main>;

  const state = accountState(result.context);
  if (state === "READY") redirect(resolveAccountDestination(result.context));
  const organization = result.context.organizations.find((item) => item.status === "active");

  return <main className="onboarding-shell"><section className="onboarding-card" role="status"><p className="eyebrow">Account setup</p><h1>{state === "AUTHENTICATED_NO_ORG" ? "Create your organization" : "Finish workspace setup"}</h1><p>{state === "AUTHENTICATED_NO_ORG" ? "Your identity is ready. Organization creation is temporarily unavailable because the tenancy service does not expose its creation endpoint." : `${organization?.organizationName ?? "Your organization"} is ready, but no active workspace is available.`}</p><div className="onboarding-identity"><span>Signed in as</span><strong>{result.context.user.email}</strong></div><p className="onboarding-safe-note">Nothing has been created or guessed. Refresh after the tenancy service is available and GrowX will resume from the persisted account state.</p></section></main>;
}
