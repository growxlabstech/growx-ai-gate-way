import { describe, expect, it } from "vitest";
import { authorizePrivileged, type PrivilegedSession } from "./index.js";
const session: PrivilegedSession = {
  id: "ps_1",
  operatorId: "op_1",
  identityKind: "workforce_privileged",
  authenticationStrength: "passkey",
  authenticatedAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-01-01T01:00:00Z"),
  capabilities: ["ops.request.inspect"],
  reason: "INC-1",
  approvalReference: null,
  scope: { organizationId: "org_1" },
  revokedAt: null,
  breakGlass: false,
};
describe("privileged access", () => {
  it("denies customer identities and cross-scope access", () => {
    expect(() =>
      authorizePrivileged(session, {
        identityKind: "customer",
        capability: "ops.request.inspect",
        organizationId: "org_1",
        now: new Date("2026-01-01T00:10:00Z"),
      }),
    ).toThrow("privileged_identity_required");
    expect(() =>
      authorizePrivileged(session, {
        identityKind: "workforce_privileged",
        capability: "ops.request.inspect",
        organizationId: "org_2",
        now: new Date("2026-01-01T00:10:00Z"),
      }),
    ).toThrow("privileged_scope_denied");
  });
});
