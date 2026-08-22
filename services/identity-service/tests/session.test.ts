import { describe, expect, it } from "vitest";
import { isSessionActive, secureCookie } from "../src/domain/session";
describe("session rules", () => {
  it("accepts active unexpired sessions", () =>
    expect(
      isSessionActive({
        userStatus: "active",
        expiresAt: new Date(Date.now() + 1000),
      }),
    ).toBe(true));
  it("rejects revoked sessions", () =>
    expect(
      isSessionActive({
        userStatus: "active",
        expiresAt: new Date(Date.now() + 1000),
        revokedAt: new Date(),
      }),
    ).toBe(false));
  it("uses hardened cookies", () =>
    expect(secureCookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    }));
});
