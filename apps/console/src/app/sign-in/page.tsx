import { AuthCard } from "../../components/auth-card";
import { redirect } from "next/navigation";
import { loadTenantContext } from "../../lib/load-tenant-context";
import { resolveAccountDestination, safeReturnTo } from "../../lib/auth-flow";

function oauthError(value: string | string[] | undefined): string {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return "";
  if (code === "access_denied") return "Sign-in was cancelled. You can try again.";
  if (code === "account_not_linked" || code === "account_conflict") return "This provider could not be linked to your existing account.";
  return "The provider could not complete sign-in. Please try again.";
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const returnToValue = Array.isArray(parameters.returnTo) ? parameters.returnTo[0] : parameters.returnTo;
  const returnTo = safeReturnTo(returnToValue);
  const context = await loadTenantContext();
  if (context.status === "ready" || context.status === "empty") redirect(resolveAccountDestination(context.context, returnTo));
  const enabledProviders = [process.env.AUTH_GOOGLE_ENABLED === "1" ? "google" : null, process.env.AUTH_GITHUB_ENABLED === "1" ? "github" : null].filter((provider): provider is "google" | "github" => provider !== null);
  return <AuthCard mode="sign-in" returnTo={returnTo} enabledProviders={enabledProviders} initialError={oauthError(parameters.error)} />;
}
