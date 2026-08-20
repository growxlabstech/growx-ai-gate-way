import { describe, it, expect } from "vitest";
import { SecretRedactor } from "../../src/vault/secret-redactor.js";

describe("Secret Redactor Middleware & Utilities", () => {
  it("redacts API keys and Bearer tokens in raw strings", () => {
    const raw = "Sending request with Bearer sk-12345678901234567890abcdef and gsk_98765432109876543210zyx";
    const sanitized = SecretRedactor.redactString(raw);
    expect(sanitized).not.toContain("sk-12345678901234567890abcdef");
    expect(sanitized).not.toContain("gsk_98765432109876543210zyx");
    expect(sanitized).toContain("Bearer [REDACTED_SECRET]");
  });

  it("redacts sensitive HTTP authorization and key headers", () => {
    const headers = {
      authorization: "Bearer secret-token-value",
      "x-api-key": "customer-api-key",
      "x-provider-key": "upstream-provider-key",
      "content-type": "application/json",
    };

    const redacted = SecretRedactor.redactHeaders(headers);
    expect(redacted.authorization).toBe("[REDACTED_HEADER]");
    expect(redacted["x-api-key"]).toBe("[REDACTED_HEADER]");
    expect(redacted["x-provider-key"]).toBe("[REDACTED_HEADER]");
    expect(redacted["content-type"]).toBe("application/json");
  });

  it("deeply redacts rawSecret, secret, and apiKey fields in objects", () => {
    const payload = {
      providerId: "openai",
      rawSecret: "super-secret-key-123",
      nested: {
        decryptedCredential: "decrypted-token-456",
        safeMeta: "production",
      },
    };

    const redacted = SecretRedactor.redactObject(payload);
    expect(redacted.rawSecret).toBe("[REDACTED]");
    expect(redacted.nested.decryptedCredential).toBe("[REDACTED]");
    expect(redacted.nested.safeMeta).toBe("production");
  });
});
