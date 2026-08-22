import { describe, it, expect } from "vitest";
import {
  parseApiKey,
  generateApiKeyCredentials,
  maskApiKey,
  publicPrefix,
  hashApiKey,
  verifyApiKey,
} from "../src/domain/key-format.js";

describe("API Key Format, Hashing, and Parsing", () => {
  const pepper = "growx-secret-pepper-32-bytes-long-string!!";

  it("generates credentials adhering to standard pattern", () => {
    const creds = generateApiKeyCredentials("production");
    expect(creds.id).toMatch(/^key_[a-f0-9]{32}$/);
    expect(creds.prefix).toBe(`gx_live_${creds.id}`);
    expect(creds.secretPart.length).toBeGreaterThanOrEqual(20);
    expect(creds.fullSecret).toBe(`${creds.prefix}_${creds.secretPart}`);

    const devCreds = generateApiKeyCredentials("development");
    expect(devCreds.prefix).toBe(`gx_test_${devCreds.id}`);
  });

  it("correctly parses valid API keys and extracts environment and keyId", () => {
    const liveKey = `gx_live_key_0123456789abcdef0123456789abcdef_${"x".repeat(32)}`;
    const parsed = parseApiKey(liveKey);
    expect(parsed).not.toBeNull();
    expect(parsed?.environment).toBe("production");
    expect(parsed?.rawEnvironment).toBe("live");
    expect(parsed?.keyId).toBe("key_0123456789abcdef0123456789abcdef");
    expect(parsed?.secret).toBe("x".repeat(32));

    const testKey = `gx_test_key_0123456789abcdef0123456789abcdef_${"y".repeat(32)}`;
    const testParsed = parseApiKey(testKey);
    expect(testParsed?.environment).toBe("development");
    expect(testParsed?.rawEnvironment).toBe("test");
  });

  it("rejects invalid, whitespace-padded, or malformed API keys", () => {
    expect(parseApiKey("")).toBeNull();
    expect(parseApiKey("invalid_prefix_key_123_abc")).toBeNull();
    expect(parseApiKey("gx_live_key_123_abc")).toBeNull();
    expect(
      parseApiKey(" gx_live_key_0123456789abcdef0123456789abcdef_secret "),
    ).toBeNull();
    expect(
      parseApiKey("gx_live_key_0123456789abcdef0123456789abcdef_secret\n"),
    ).toBeNull();
    expect(parseApiKey("a".repeat(400))).toBeNull();
  });

  it("verifies hash and timing-safe equality with pepper", () => {
    const secretPart = "my-secure-secret-token-part-12345";
    const hash = hashApiKey(secretPart, pepper);
    expect(hash.length).toBeGreaterThan(20);

    expect(verifyApiKey(secretPart, hash, pepper)).toBe(true);
    expect(verifyApiKey("wrong-secret-token", hash, pepper)).toBe(false);
    expect(
      verifyApiKey(
        secretPart,
        hash,
        "different-pepper-at-least-32-chars-long!!",
      ),
    ).toBe(false);
  });

  it("masks keys safely exposing only environment and prefix", () => {
    const raw = `gx_live_key_0123456789abcdef0123456789abcdef_${"s".repeat(32)}`;
    const masked = maskApiKey(raw);
    expect(masked).toBe(
      "gx_live_key_0123456789abcdef0123456789abcdef_••••••••••••",
    );
    expect(masked).not.toContain("s".repeat(32));

    expect(maskApiKey("")).toBe("••••••••");
  });

  it("formats public prefix correctly", () => {
    const pub = publicPrefix({
      environment: "production",
      id: "key_0123456789abcdef0123456789abcdef",
    });
    expect(pub).toBe(
      "gx_live_key_0123456789abcdef0123456789abcdef_••••••••••••",
    );
  });
});
