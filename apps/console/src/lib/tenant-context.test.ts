import { describe, expect, it } from "vitest";
import { isNavigationActive, parseTenantContext, switchWorkspacePath, workspacesForOrganization } from "./tenant-context";

const contextPayload = {
  user: { id: "usr_1", name: "Avery Lin", email: "avery@example.com", avatarUrl: null },
  sessionId: "ses_1",
  organizations: [{ organizationId: "org_1", organizationName: "Northstar Labs", organizationSlug: "northstar", status: "active" }],
  workspaces: [
    { workspaceId: "ws_1", workspaceName: "Production", workspaceSlug: "production", organizationId: "org_1", status: "active" },
    { workspaceId: "ws_2", workspaceName: "Suspended", workspaceSlug: "suspended", organizationId: "org_1", status: "suspended" },
    { workspaceId: "ws_3", workspaceName: "Foreign", workspaceSlug: "foreign", organizationId: "org_2", status: "active" },
  ],
};

describe("tenant context", () => {
  it("accepts the identity context contract and rejects malformed data", () => {
    expect(parseTenantContext(contextPayload)?.user.email).toBe("avery@example.com");
    expect(parseTenantContext({ user: {}, organizations: [], workspaces: [] })).toBeNull();
  });

  it("scopes active workspaces to the active organization", () => {
    const context = parseTenantContext(contextPayload)!;
    expect(workspacesForOrganization(context, "org_1").map((workspace) => workspace.workspaceSlug)).toEqual(["production"]);
  });

  it("preserves valid workspace routes and falls back safely", () => {
    expect(switchWorkspacePath("/northstar/production/models/growx-fast", "northstar", "production", "staging")).toBe("/northstar/staging/models/growx-fast");
    expect(switchWorkspacePath("/northstar/members", "northstar", undefined, "staging")).toBe("/northstar/staging/overview");
  });

  it("keeps nested navigation parents active", () => {
    expect(isNavigationActive("/northstar/production/api-keys/key_1", "/northstar/production/api-keys")).toBe(true);
    expect(isNavigationActive("/northstar/production/models", "/northstar/production/api-keys")).toBe(false);
  });
});
