import { NextRequest, NextResponse } from "next/server";

const identityServiceUrl =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";

function createContentSecurityPolicy(nonce: string): string {
  const developmentDirective =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const styleDirective =
    process.env.NODE_ENV === "development"
      ? " 'unsafe-inline'"
      : ` 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentDirective}`,
    `style-src 'self'${styleDirective}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function continueWithSecurityHeaders(
  request: NextRequest,
  nonce: string,
  contentSecurityPolicy: string,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

/**
 * Optimistic route gate. Every data API must still resolve membership,
 * workspace scope, permissions, and resource status on the backend.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/growx-auth-crystal.png"
  ) {
    return NextResponse.next();
  }

  const publicPaths = [
    "/",
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/health",
    "/live",
    "/ready",
  ];
  if (process.env.D2_FIXTURE_IDENTITY === "1") publicPaths.push("/d2-session");
  const protectedRoute =
    pathname === "/select-organization" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/onboarding" ||
    (!publicPaths.includes(pathname) && !pathname.startsWith("/design/"));
  if (!protectedRoute)
    return continueWithSecurityHeaders(request, nonce, contentSecurityPolicy);

  const identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4100";
  try {
    const response = await fetch(`${identityServiceUrl}/v1/auth/get-session`, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        ...(process.env.D2_FIXTURE_IDENTITY === "1"
          ? { "x-d2-fixture": "tenant-a" }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) {
      const session: unknown = await response.json();
      if (session && typeof session === "object" && "session" in session)
        return continueWithSecurityHeaders(
          request,
          nonce,
          contentSecurityPolicy,
        );
    }
  } catch {
    // Identity uncertainty fails closed.
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "returnTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|growx-auth-crystal.png).*)",
  ],
};
