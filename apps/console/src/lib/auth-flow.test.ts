import { describe, expect, it } from "vitest";
import { accountState, describeAuthProblem, resolveAccountDestination, safeReturnTo } from "./auth-flow";
import type { TenantContext } from "./tenant-context";

const base: TenantContext = { user: { id: "usr_1", name: "Avery", email: "avery@example.com", avatarUrl: null }, sessionId: "ses_1", organizations: [], workspaces: [] };

describe("D3 account destination", () => {
  it("derives resumable onboarding states", () => {
    expect(accountState(base)).toBe("AUTHENTICATED_NO_ORG");
    expect(accountState({ ...base, organizations: [{ organizationId: "org_1", organizationName: "Northstar", organizationSlug: "northstar", status: "active" }] })).toBe("AUTHENTICATED_ORG_NO_WORKSPACE");
  });

  it("returns a valid authorized deep link and rejects another tenant", () => {
    const context: TenantContext = { ...base, organizations: [{ organizationId: "org_1", organizationName: "Northstar", organizationSlug: "northstar", status: "active" }], workspaces: [{ workspaceId: "ws_1", workspaceName: "Production", workspaceSlug: "production", organizationId: "org_1", status: "active" }] };
    expect(resolveAccountDestination(context, "/northstar/production/api-keys?tab=active")).toBe("/northstar/production/api-keys?tab=active");
    expect(resolveAccountDestination(context, "/orbit/core/settings")).toBe("/northstar/production/overview");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"])("rejects unsafe returnTo %s", (value) => expect(safeReturnTo(value)).toBeNull());
});

describe("D3 auth errors", () => {
  it("distinguishes invalid and expired codes", () => {
    expect(describeAuthProblem(400, { code: "INVALID_OTP" }).message).toBe("Invalid code. Try again.");
    expect(describeAuthProblem(400, { code: "OTP_EXPIRED" }).message).toContain("expired");
  });

  it("uses backend retry-after information", () => expect(describeAuthProblem(429, {}, "42")).toMatchObject({ retryAfterSeconds: 42, terminal: true }));
});
