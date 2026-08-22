import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseTenantContext } from "../../../../lib/tenant-context";
import { resolveAccountDestination } from "../../../../lib/auth-flow";

const identityServiceUrl =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => ({}));
  const returnTo =
    body &&
    typeof body === "object" &&
    "returnTo" in body &&
    typeof body.returnTo === "string"
      ? body.returnTo
      : null;
  try {
    const response = await fetch(`${identityServiceUrl}/v1/auth/context`, {
      method: "POST",
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401)
      return NextResponse.json(
        { error: "Session unavailable" },
        { status: 401 },
      );
    if (!response.ok)
      return NextResponse.json(
        { error: "Context unavailable" },
        { status: 503 },
      );
    const context = parseTenantContext(await response.json());
    if (!context)
      return NextResponse.json(
        { error: "Context unavailable" },
        { status: 503 },
      );
    return NextResponse.json({
      destination: resolveAccountDestination(context, returnTo),
    });
  } catch {
    return NextResponse.json({ error: "Context unavailable" }, { status: 503 });
  }
}
