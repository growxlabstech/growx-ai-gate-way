import { describe, expect, it } from "vitest";
import { hasPermission, type AuthorizationContext } from "../src/index";
const active: AuthorizationContext = {
  userId: "usr_1",
  organizationId: "org_1",
  accountStatus: "active",
  organizationStatus: "active",
  roles: ["developer"],
};
describe("permission evaluation", () => {
  it("grants mapped permissions", () =>
    expect(hasPermission(active, "workspace.update")).toBe(true));
  it("denies unmapped permissions", () =>
    expect(hasPermission(active, "billing.manage")).toBe(false));
  it("denies suspended accounts regardless of role", () =>
    expect(
      hasPermission(
        {
          ...active,
          accountStatus: "suspended",
          roles: ["organization_owner"],
        },
        "organization.read",
      ),
    ).toBe(false));
  it("denies cross-workspace inactive context", () =>
    expect(
      hasPermission(
        { ...active, workspaceStatus: "archived" },
        "workspace.read",
      ),
    ).toBe(false));
});
