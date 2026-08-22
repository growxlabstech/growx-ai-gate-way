import { redirect } from "next/navigation";
import Link from "next/link";
import { loadTenantContext } from "../../lib/load-tenant-context";
import { accountState, resolveAccountDestination } from "../../lib/auth-flow";
import { OnboardingForm } from "../../components/onboarding-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await loadTenantContext();
  if (result.status === "unauthenticated")
    redirect("/sign-in?returnTo=%2Fonboarding");
  if (result.status === "error")
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card" role="alert">
          <p className="eyebrow">Account setup</p>
          <h1>Context unavailable</h1>
          <p>
            GrowX could not safely resolve your account state. No organization
            or workspace was created.
          </p>
          <Link className="auth-primary onboarding-retry" href="/onboarding">
            Retry
          </Link>
        </section>
      </main>
    );

  const state = accountState(result.context);
  if (state === "READY") redirect(resolveAccountDestination(result.context));
  const organization = result.context.organizations.find(
    (item) => item.status === "active",
  );

  return (
    <OnboardingForm
      mode={state === "AUTHENTICATED_NO_ORG" ? "organization" : "workspace"}
      email={result.context.user.email}
      organizationId={organization?.organizationId}
      organizationName={organization?.organizationName}
    />
  );
}
