export type ConsoleUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};
export type ConsoleOrganization = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  status: string;
};
export type ConsoleWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  organizationId: string;
  status: string;
};
export type TenantContext = {
  user: ConsoleUser;
  sessionId: string;
  organizations: ConsoleOrganization[];
  workspaces: ConsoleWorkspace[];
};

const workspaceSections = new Set([
  "overview",
  "playground",
  "models",
  "api-keys",
  "logs",
  "usage",
  "analytics",
  "billing",
  "environments",
  "members",
  "service-accounts",
  "webhooks",
  "settings",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

export function parseTenantContext(value: unknown): TenantContext | null {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !hasString(value.user, "id") ||
    !hasString(value.user, "email") ||
    !hasString(value, "sessionId") ||
    !Array.isArray(value.organizations) ||
    !Array.isArray(value.workspaces)
  )
    return null;
  const organizations = value.organizations.filter(
    (item): item is ConsoleOrganization =>
      isRecord(item) &&
      hasString(item, "organizationId") &&
      hasString(item, "organizationName") &&
      hasString(item, "organizationSlug") &&
      hasString(item, "status"),
  );
  const workspaces = value.workspaces.filter(
    (item): item is ConsoleWorkspace =>
      isRecord(item) &&
      hasString(item, "workspaceId") &&
      hasString(item, "workspaceName") &&
      hasString(item, "workspaceSlug") &&
      hasString(item, "organizationId") &&
      hasString(item, "status"),
  );
  return {
    user: {
      id: value.user.id as string,
      email: value.user.email as string,
      name: typeof value.user.name === "string" ? value.user.name : null,
      avatarUrl:
        typeof value.user.avatarUrl === "string" ? value.user.avatarUrl : null,
    },
    sessionId: value.sessionId as string,
    organizations,
    workspaces,
  };
}

export function workspacesForOrganization(
  context: TenantContext,
  organizationId: string,
): ConsoleWorkspace[] {
  return context.workspaces.filter(
    (workspace) =>
      workspace.organizationId === organizationId &&
      workspace.status === "active",
  );
}
export function isNavigationActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
export function switchWorkspacePath(
  pathname: string,
  organizationSlug: string,
  currentWorkspaceSlug: string | undefined,
  nextWorkspaceSlug: string,
): string {
  const segments = pathname.split("/").filter(Boolean);
  const suffix = currentWorkspaceSlug ? segments.slice(2) : [];
  const preservedSuffix =
    suffix[0] && workspaceSections.has(suffix[0]) ? suffix : ["overview"];
  return `/${organizationSlug}/${nextWorkspaceSlug}/${preservedSuffix.join("/")}`;
}
export function initialsForUser(user: ConsoleUser): string {
  const source = user.name?.trim() || user.email;
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GX"
  );
}
