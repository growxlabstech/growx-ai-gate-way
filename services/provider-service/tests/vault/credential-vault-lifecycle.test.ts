import { describe, it, expect } from "vitest";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { InMemorySecretProvider } from "../../src/vault/secret-provider.js";
import { ProviderCredentialVaultService } from "../../src/vault/provider-credential-vault-service.js";
import { ProviderAccountService } from "../../src/vault/provider-account-service.js";

describe("Provider Credential Vault Zero-Downtime Lifecycle", () => {
  const repo = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const secretProvider = new InMemorySecretProvider();
  const accountService = new ProviderAccountService(repo, events);
  const vaultService = new ProviderCredentialVaultService(repo, secretProvider, events);

  it("creates credential with zero database plaintext and manages atomic version rotation", async () => {
    // Setup provider and account
    await repo.createProvider({
      id: "prov_anthropic",
      code: "anthropic",
      displayName: "Anthropic",
      adapterType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      region: "us",
      priority: 100,
      enabled: true,
      status: "active",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const account = await accountService.createAccount(
      "prov_anthropic",
      {
        displayName: "Anthropic Production",
        accountType: "standard",
        environment: "production",
        priority: 1,
        metadata: {},
      },
      "admin"
    );

    // 1. Create Credential V1
    const { credential, version: v1 } = await vaultService.createCredential(
      account.id,
      {
        name: "Anthropic Main Secret",
        credentialType: "api_key",
        rawSecret: "mock-ant-api03-initial-secret-key-12345678",
        environment: "production",
        metadata: {},
        autoActivate: true,
        validateBeforeActivation: false,
      },
      "admin"
    );

    expect(credential.id).toBeDefined();
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("active");
    expect(v1.keyFingerprint).toContain("5678#");
    // Verify secret is stored in vault, not in DB record
    const vaultSecret = await secretProvider.getSecret(v1.secretReference);
    expect(vaultSecret).toBe("mock-ant-api03-initial-secret-key-12345678");

    // 2. Rotate Credential to V2
    const { newVersion: v2 } = await vaultService.rotateCredential(
      credential.id,
      {
        newRawSecret: "mock-ant-api03-rotated-secret-key-87654321",
        reason: "Scheduled 90-day rotation",
        validateBeforeActivation: false,
      },
      "admin"
    );

    expect(v2.version).toBe(2);
    expect(v2.status).toBe("active");

    // Previous active version (v1) should now be draining
    const oldV1 = await repo.getCredentialVersionById(v1.id);
    expect(oldV1?.status).toBe("draining");

    // 3. Rollback to V1
    const rolledBack = await vaultService.rollbackVersion(credential.id, v1.id, "admin");
    expect(rolledBack.id).toBe(v1.id);
    expect(rolledBack.status).toBe("active");

    // 4. Emergency Revocation
    const revoked = await vaultService.emergencyRevoke(credential.id, "Suspected compromise", "admin");
    expect(revoked.status).toBe("revoked");
  });
});
