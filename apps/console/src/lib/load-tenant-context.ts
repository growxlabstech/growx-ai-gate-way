import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { parseTenantContext, type TenantContext } from "./tenant-context";

export type TenantContextResult =
  | { status: "ready"; context: TenantContext }
  | { status: "unauthenticated" }
  | { status: "empty"; context: TenantContext }
  | { status: "error" };

export const loadTenantContext = cache(
  async function loadTenantContext(): Promise<TenantContextResult> {
    const identityServiceUrl =
      process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4000";
    const cookieHeader = (await cookies()).toString();
    try {
      const response = await fetch(`${identityServiceUrl}/v1/auth/context`, {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          ...(process.env.D2_FIXTURE_IDENTITY === "1"
            ? { "x-d2-fixture": "tenant-a" }
            : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 401) return { status: "unauthenticated" };
      if (!response.ok) return { status: "error" };
      const context = parseTenantContext(await response.json());
      if (!context) return { status: "error" };
      return context.organizations.length === 0
        ? { status: "empty", context }
        : { status: "ready", context };
    } catch {
      return { status: "error" };
    }
  },
);
