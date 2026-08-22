import { redirect } from "next/navigation";
import { loadTenantContext } from "../../lib/load-tenant-context";
import { InvitationAcceptance } from "../../components/invitation-acceptance";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  if (token.length < 16 || token.length > 512)
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card" role="alert">
          <p className="eyebrow">Organization invitation</p>
          <h1>Invitation unavailable</h1>
          <p>This invitation link is invalid.</p>
        </section>
      </main>
    );
  const result = await loadTenantContext();
  if (result.status === "unauthenticated")
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(`/accept-invitation?token=${token}`)}`,
    );
  if (result.status === "error")
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card" role="alert">
          <p className="eyebrow">Organization invitation</p>
          <h1>Context unavailable</h1>
          <p>GrowX could not safely verify your account.</p>
        </section>
      </main>
    );
  return (
    <InvitationAcceptance token={token} email={result.context.user.email} />
  );
}
