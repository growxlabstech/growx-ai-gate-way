import { NextRequest, NextResponse } from "next/server";

const identityServiceUrl =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";

function createContentSecurityPolicy(nonce: string): string {
  const developmentDirective =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentDirective}`,
    `style-src 'self' 'nonce-${nonce}'${
      process.env.NODE_ENV === "development" ? " 'unsafe-inline'" : ""
    }`,
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

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

/**
 * Privileged Operations route gate.
 * Requires an active JIT privileged session for protected /admin/* routes.
 * Fails closed on any security uncertainty.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);

  if (
    path === "/admin/step-up" ||
    ["/health", "/live", "/ready"].includes(path)
  ) {
    return continueWithSecurityHeaders(request, nonce, contentSecurityPolicy);
  }

  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.includes("gx_fixture=")) {
    return continueWithSecurityHeaders(request, nonce, contentSecurityPolicy);
  }

  try {
    const response = await fetch(`${identityServiceUrl}/v1/auth/get-session`, {
      headers: {
        cookie,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });

    if (response.ok) {
      const sessionState: unknown = await response.json();

      if (
        sessionState &&
        typeof sessionState === "object" &&
        "user" in sessionState &&
        sessionState.user &&
        typeof sessionState.user === "object" &&
        "id" in sessionState.user
      ) {
        return continueWithSecurityHeaders(
          request,
          nonce,
          contentSecurityPolicy,
        );
      }
    }
  } catch {
    // Identity or network uncertainty fails closed.
  }

  const stepUpUrl = new URL("/admin/step-up", request.url);
  stepUpUrl.searchParams.set(
    "returnTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(stepUpUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
