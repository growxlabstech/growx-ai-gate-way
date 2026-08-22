import { describe, expect, it } from "vitest";
import {
  assertWorkspaceScope,
  createWorkspaceSlug,
} from "../src/domain/workspace";
describe("workspace tenancy", () => {
  it("normalizes workspace slugs", () =>
    expect(createWorkspaceSlug("Production APIs")).toBe("production-apis"));
  it("rejects cross-tenant access", () =>
    expect(() =>
      assertWorkspaceScope("org_a", {
        organizationId: "org_b",
        workspaceId: "wrk_1",
      }),
    ).toThrow("Cross-tenant"));
});
