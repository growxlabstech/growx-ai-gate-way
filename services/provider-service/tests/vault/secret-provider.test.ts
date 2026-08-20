import { describe, it, expect } from "vitest";
import {
  InMemorySecretProvider,
  EnvelopeEncryptionSecretProvider,
  generateSecretFingerprint,
  LegacyEnvCredentialAdapter,
} from "../../src/vault/secret-provider.js";

describe("Secret Provider Infrastructure", () => {
  it("generates deterministic safe fingerprints without exposing raw secrets", () => {
    const secret = "sk-live-1234567890abcdef1234567890abcdef12345678";
    const fingerprint = generateSecretFingerprint(secret);
    expect(fingerprint).toContain("sk-...");
    expect(fingerprint).toContain("5678#");
    expect(fingerprint).not.toContain("abcdef");
  });

  it("stores and retrieves secrets securely in InMemorySecretProvider", async () => {
    const provider = new InMemorySecretProvider();
    const ref = "vault/openai/pacc_1/pcred_1/v1";
    await provider.putSecret(ref, "sk-mock-key-123", { env: "prod" });

    const retrieved = await provider.getSecret(ref);
    expect(retrieved).toBe("sk-mock-key-123");

    const health = await provider.health();
    expect(health.status).toBe("healthy");

    await provider.deleteSecret(ref);
    const missing = await provider.getSecret(ref);
    expect(missing).toBeNull();
  });

  it("encrypts and decrypts secrets with AES-256-GCM in EnvelopeEncryptionSecretProvider", async () => {
    const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const provider = new EnvelopeEncryptionSecretProvider(key);
    const ref = "vault/anthropic/pacc_2/pcred_2/v1";

    await provider.putSecret(ref, "sk-ant-secret-payload", { account: "anthropic-enterprise" });

    const decrypted = await provider.getSecret(ref);
    expect(decrypted).toBe("sk-ant-secret-payload");

    const health = await provider.health();
    expect(health.status).toBe("healthy");
  });

  it("resolves fallback secrets via LegacyEnvCredentialAdapter", () => {
    process.env.OPENAI_API_KEY = "sk-test-legacy-openai";
    const secret = LegacyEnvCredentialAdapter.getLegacySecret("openai");
    expect(secret).toBe("sk-test-legacy-openai");
    delete process.env.OPENAI_API_KEY;
  });
});
