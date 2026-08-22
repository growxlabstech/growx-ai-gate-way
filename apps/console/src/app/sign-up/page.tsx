import { redirect } from "next/navigation";
import { safeReturnTo } from "../../lib/auth-flow";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const value = Array.isArray(parameters.returnTo)
    ? parameters.returnTo[0]
    : parameters.returnTo;
  const returnTo = safeReturnTo(value);
  redirect(
    returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in",
  );
}
