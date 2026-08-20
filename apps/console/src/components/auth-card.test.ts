import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "./auth-card";

describe("passwordless authentication input", () => {
  it("normalizes email identity before submission", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it.each(["", "user", "user@", "@example.com", "user @example.com"])("rejects malformed email %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("accepts a valid email address", () => {
    expect(isValidEmail("user@company.com")).toBe(true);
  });
});
