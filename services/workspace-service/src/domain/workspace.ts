export function createWorkspaceSlug(value: string): string { return value.normalize("NFKD").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63); }
export interface WorkspaceScope { organizationId: string; workspaceId: string; }
export function assertWorkspaceScope(expectedOrganizationId: string, scope: WorkspaceScope): void { if (scope.organizationId !== expectedOrganizationId) throw new Error("Cross-tenant workspace access denied"); }
