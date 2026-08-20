/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry } from "@growx/provider-sdk";
import { GrowXProviderError } from "@growx/contracts";
import { ProviderCredentialCrypto } from "../../src/application/credential-crypto.js";
import { ProviderService } from "../../src/application/provider-service.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";

describe("Credential Rotation Integration Tests", () => {
  const repository = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const crypto = new ProviderCredentialCrypto();
  const service = new ProviderService(repository, events, crypto, defaultAdapterRegistry);

  it("rotates credential and verifies updated encryption payload and timestamp", async () => {
    await service.createProvider(
      {
        code: "anthropic",
        displayName: "Anthropic",
        adapterType: "anthropic",
        baseUrl: "https://api.anthropic.com",
      },
      "usr_operator_1"
    );

    const initial = await service.createCredential(
      "anthropic",
      {
        name: "primary",
        environment: "production",
        rawSecret: "sk-ant-initial-secret-key",
      },
      "usr_operator_1"
    );

    const rotated = await service.rotateCredential(
      initial.id,
      {
        newRawSecret: "sk-ant-newly-rotated-secret-key-999",
        reason: "Quarterly key rotation",
      },
      "usr_operator_1"
    );

    expect(rotated.id).toBe(initial.id);
    expect(rotated.rotatedAt).toBeInstanceOf(Date);
    expect(rotated.encryptedPayload).not.toBe(initial.encryptedPayload);

    // Decrypting rotated payload returns the new key
    const decrypted = crypto.decrypt(rotated.encryptedPayload, rotated.encryptionKeyVersion);
    expect(decrypted).toBe("sk-ant-newly-rotated-secret-key-999");
  });

  it("disables credential and rejects execution with disabled credential", async () => {
    const cred = await service.createCredential(
      "anthropic",
      {
        name: "backup-account",
        environment: "production",
        rawSecret: "sk-ant-backup-secret",
      },
      "usr_operator_1"
    );

    const disabled = await service.disableCredential(cred.id, "usr_operator_1");
    expect(disabled.status).toBe("disabled");
    expect(disabled.disabledAt).toBeInstanceOf(Date);

    // Attempting execution using this specific disabled credential
    await expect(
      service.executeRoute(
        {
          providerId: "anthropic",
          providerModelId: "claude-3-5-sonnet-20241022",
          capabilities: ["text.generate"],
          credentialId: cred.id,
        },
        {
          requestId: "req_rot_1",
          canonicalModelId: "anthropic/claude-3-5-sonnet",
          providerModelId: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hi" }],
        }
      )
    ).rejects.toThrow(GrowXProviderError);
  });
});
