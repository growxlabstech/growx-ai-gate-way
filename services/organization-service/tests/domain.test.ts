import { describe, expect, it } from "vitest";
import { canAcceptInvitation } from "../src/domain/invitation";
import { createSlug } from "../src/domain/slug";
describe("organization rules", () => {
  it("creates stable slugs", () =>
    expect(createSlug(" GrowX  Demo! ")).toBe("growx-demo"));
  it("rejects expired invitations", () =>
    expect(canAcceptInvitation({ expiresAt: new Date(0) })).toBe(false));
  it("accepts unused live invitations", () =>
    expect(
      canAcceptInvitation({ expiresAt: new Date(Date.now() + 1000) }),
    ).toBe(true));
});
