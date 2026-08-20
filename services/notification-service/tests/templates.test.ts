import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/templates";
describe("email templates", () => { it("renders variables without leaking unrelated data", () => expect(renderTemplate("verify-email", { url: "https://example.test/verify" }).text).toContain("https://example.test/verify")); });
describe("authentication OTP email", () => { it("renders the code and expiry context", () => expect(renderTemplate("auth-otp", { otp: "123456", expiresInMinutes: "10" }).text).toContain("123456")); });
