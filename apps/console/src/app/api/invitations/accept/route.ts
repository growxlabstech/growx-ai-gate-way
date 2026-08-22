import { NextRequest, NextResponse } from "next/server";

const identityServiceUrl =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4000";

export async function POST(request: NextRequest) {
  const response = await fetch(`${identityServiceUrl}/v1/invitations/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
      "x-request-id":
        request.headers.get("x-request-id") ??
        `req_${crypto.randomUUID().replaceAll("-", "")}`,
    },
    body: JSON.stringify(await request.json()),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
