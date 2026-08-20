import { describe, it, expect } from "vitest";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemorySecretProvider } from "../../src/vault/secret-provider.js";
import { SecretReconciliationWorker } from "../../src/vault/secret-reconciler.js";

describe("Secret Reconciliation & Orphan Detection", () => {
  it("reconciles metadata records against underlying secret provider vault", async () => {
    const repo = new InMemoryProviderRepository();
    const secretProvider = new InMemorySecretProvider();
    const reconciler = new SecretReconciliationWorker(repo, secretProvider);

    // Add valid version + secret
    await secretProvider.putSecret("vault/prov/acc/cred1/v1", "secret1");
    await repo.createCredentialVersion({
      id: "v1",
      credentialId: "cred1",
      version: 1,
      secretReference: "vault/prov/acc/cred1/v1",
      keyFingerprint: "fingerprint1",
      status: "active",
      validationStatus: "valid",
      metadata: {},
      createdAt: new Date(),
    });

    // Add orphaned metadata record with missing vault payload
    await repo.createCredentialVersion({
      id: "v2",
      credentialId: "cred2",
      version: 1,
      secretReference: "vault/prov/acc/cred2/v1",
      keyFingerprint: "fingerprint2",
      status: "active",
      validationStatus: "valid",
      metadata: {},
      createdAt: new Date(),
    });

    const report = await reconciler.reconcile();
    expect(report.scannedCount).toBe(2);
    expect(report.healthyCount).toBe(1);
    expect(report.missingVaultSecrets.length).toBe(1);
    expect(report.missingVaultSecrets[0]?.versionId).toBe("v2");
  });
});
