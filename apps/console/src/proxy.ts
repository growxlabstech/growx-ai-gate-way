import { NextRequest, NextResponse } from "next/server";

const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";

/**
 * Optimistic route gate. Every data API must still resolve membership,
 * workspace scope, permissions, and resource status on the backend.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/growx-auth-crystal.png"
  ) {
    return NextResponse.next();
  }

  try {
    const response = await fetch(`${identityServiceUrl}/v1/auth/get-session`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) {
      const session: unknown = await response.json();
      if (session && typeof session === "object" && "session" in session) return NextResponse.next();
    }
  } catch {
    // Identity uncertainty fails closed.
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/select-organization",
    "/onboarding/:path*",
    "/:organizationSlug((?!api|_next|design|sign-in|sign-up|verify-email|forgot-password|reset-password|health|live|ready).*)/:path*",
  ],
};
