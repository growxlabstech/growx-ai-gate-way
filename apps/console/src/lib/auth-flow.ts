import type { TenantContext } from "./tenant-context";

export type AccountState =
  "AUTHENTICATED_NO_ORG" | "AUTHENTICATED_ORG_NO_WORKSPACE" | "READY";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return null;
  try {
    const url = new URL(value, "https://growx.invalid");
    if (url.origin !== "https://growx.invalid" || url.username || url.password)
      return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function accountState(context: TenantContext): AccountState {
  const activeOrganizations = context.organizations.filter(
    (organization) => organization.status === "active",
  );
  if (activeOrganizations.length === 0) return "AUTHENTICATED_NO_ORG";
  const activeOrganizationIds = new Set(
    activeOrganizations.map((organization) => organization.organizationId),
  );
  const activeWorkspaces = context.workspaces.filter(
    (workspace) =>
      workspace.status === "active" &&
      activeOrganizationIds.has(workspace.organizationId),
  );
  return activeWorkspaces.length === 0
    ? "AUTHENTICATED_ORG_NO_WORKSPACE"
    : "READY";
}

export function resolveAccountDestination(
  context: TenantContext,
  requestedReturnTo?: string | null,
): string {
  const state = accountState(context);
  if (state !== "READY") return "/onboarding";
  const safeDestination = safeReturnTo(requestedReturnTo);
  if (safeDestination) {
    const destinationUrl = new URL(safeDestination, "https://growx.invalid");
    if (
      destinationUrl.pathname === "/accept-invitation" &&
      (destinationUrl.searchParams.get("token")?.length ?? 0) >= 16
    )
      return safeDestination;
    const segments = destinationUrl.pathname.split("/").filter(Boolean);
    const organization = context.organizations.find(
      (item) =>
        item.status === "active" && item.organizationSlug === segments[0],
    );
    const workspace =
      organization &&
      context.workspaces.find(
        (item) =>
          item.status === "active" &&
          item.organizationId === organization.organizationId &&
          item.workspaceSlug === segments[1],
      );
    if (organization && (segments.length === 1 || workspace))
      return safeDestination;
  }
  const organization = context.organizations.find(
    (item) => item.status === "active",
  );
  const workspace =
    organization &&
    context.workspaces.find(
      (item) =>
        item.status === "active" &&
        item.organizationId === organization.organizationId,
    );
  return workspace
    ? `/${organization.organizationSlug}/${workspace.workspaceSlug}/overview`
    : "/onboarding";
}

export type AuthProblem = {
  message: string;
  retryAfterSeconds: number | null;
  requestId: string | null;
  terminal: boolean;
};

export function describeAuthProblem(
  status: number,
  payload: unknown,
  retryAfterHeader?: string | null,
): AuthProblem {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? nested.code ?? "").toUpperCase();
  const backendMessage = String(
    record.message ?? nested.message ?? record.error ?? "",
  ).toUpperCase();
  const retryAfter = Number(retryAfterHeader);
  const retryAfterSeconds =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.ceil(retryAfter)
      : null;
  const requestIdValue = record.requestId ?? nested.requestId;
  const requestId = typeof requestIdValue === "string" ? requestIdValue : null;
  if (
    code.includes("OTP_EXPIRED") ||
    backendMessage.includes("OTP EXPIRED") ||
    status === 410
  )
    return {
      message: "This code has expired. Send a new code to continue.",
      retryAfterSeconds,
      requestId,
      terminal: false,
    };
  if (
    code.includes("TOO_MANY_ATTEMPTS") ||
    backendMessage.includes("TOO MANY ATTEMPTS")
  )
    return {
      message: "Too many verification attempts. Send a new code to continue.",
      retryAfterSeconds,
      requestId,
      terminal: true,
    };
  if (
    code.includes("INVALID_OTP") ||
    backendMessage.includes("INVALID OTP") ||
    status === 401
  )
    return {
      message: "Invalid code. Try again.",
      retryAfterSeconds,
      requestId,
      terminal: false,
    };
  if (status === 429)
    return {
      message: retryAfterSeconds
        ? `Too many attempts. Try again in ${retryAfterSeconds}s.`
        : "Too many attempts. Please wait before trying again.",
      retryAfterSeconds,
      requestId,
      terminal: true,
    };
  if (status === 400 || status === 422)
    return {
      message: "Check the information and try again.",
      retryAfterSeconds,
      requestId,
      terminal: false,
    };
  if (status >= 500)
    return {
      message: "Authentication is temporarily unavailable. Please try again.",
      retryAfterSeconds,
      requestId,
      terminal: false,
    };
  return {
    message: "Authentication could not be completed. Please try again.",
    retryAfterSeconds,
    requestId,
    terminal: false,
  };
}
