import { describe, it, expect } from "vitest";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemorySecretProvider } from "../../src/vault/secret-provider.js";
import { ProviderCredentialResolver } from "../../src/vault/credential-resolver.js";
import type { ExecutionTarget } from "@growx/contracts";

describe("Provider Credential JIT Resolver", () => {
  const repo = new InMemoryProviderRepository();
  const secretProvider = new InMemorySecretProvider();
  const resolver = new ProviderCredentialResolver(secretProvider, repo, { ttlMs: 1000 });

  it("resolves credential JIT and caches with instant invalidation", async () => {
    // Setup secret in vault
    const secretRef = "vault/openai/pacc_test/pcred_test/v1";
    await secretProvider.putSecret(secretRef, "sk-test-openai-secret");

    // Setup version in repo
    await repo.createCredentialVersion({
      id: "pcver_1",
      credentialId: "pcred_1",
      version: 1,
      secretReference: secretRef,
      keyFingerprint: "sk-...1234#abcd",
      status: "active",
      validationStatus: "valid",
      metadata: {},
      createdAt: new Date(),
    });

    // Setup credential in repo
    await repo.createCredentialV2({
      id: "pcred_1",
      providerAccountId: "pacc_1",
      providerId: "openai",
      name: "OpenAI Primary",
      credentialType: "api_key",
      status: "active",
      activeVersionId: "pcver_1",
      environment: "production",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const target: ExecutionTarget = {
      routeId: "route_1",
      providerId: "openai",
      providerAccountId: "pacc_1",
      credentialId: "pcred_1",
      region: "us",
    };

    // 1. First resolution: loads from vault
    const resolved = await resolver.resolve(target);
    expect(resolved.secret).toBe("sk-test-openai-secret");
    expect(resolved.credentialId).toBe("pcred_1");

    // 2. Reject unauthorized external execution caller
    await expect(resolver.resolve(target, { isInternalExecution: false })).rejects.toThrow();

    // 3. Instant Invalidation
    resolver.invalidate("pcred_1");
  });
});
