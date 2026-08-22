import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  hashApiKey,
  secureRandom,
  verifyApiKey,
} from "./index.js";
const pepper = "p".repeat(32);
describe("cryptography", () => {
  it("generates unique URL-safe high entropy values", () => {
    const a = secureRandom();
    expect(a).not.toBe(secureRandom());
    expect(a).toMatch(/^[\w-]+$/);
  });
  it("hashes and verifies API key secrets", () => {
    const secret = secureRandom();
    const hash = hashApiKey(secret, pepper);
    expect(hash).not.toContain(secret);
    expect(verifyApiKey(secret, hash, pepper)).toBe(true);
    expect(verifyApiKey(`${secret}x`, hash, pepper)).toBe(false);
  });
  it("compares values safely", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });
  it("encrypts authenticated secrets", () => {
    const key = Buffer.alloc(32, 7);
    expect(decryptSecret(encryptSecret("provider-token", key), key)).toBe(
      "provider-token",
    );
  });
});
