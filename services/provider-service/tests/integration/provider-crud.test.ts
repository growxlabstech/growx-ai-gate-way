/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry } from "@growx/provider-sdk";
import { GrowXProviderError } from "@growx/contracts";
import { ProviderCredentialCrypto } from "../../src/application/credential-crypto.js";
import { ProviderService } from "../../src/application/provider-service.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { toCredentialMetadata } from "../../src/domain/serializers.js";

describe("Provider & Credential CRUD Integration Tests", () => {
  const repository = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const crypto = new ProviderCredentialCrypto();
  const service = new ProviderService(
    repository,
    events,
    crypto,
    defaultAdapterRegistry,
  );

  it("creates and retrieves a new provider", async () => {
    const provider = await service.createProvider(
      {
        code: "openai",
        displayName: "OpenAI",
        adapterType: "openai",
        baseUrl: "https://api.openai.com/v1",
        priority: 100,
        region: "global",
      },
      "usr_operator_1",
    );

    expect(provider.id).toMatch(/^prov_/);
    expect(provider.code).toBe("openai");
    expect(provider.status).toBe("active");
    expect(provider.enabled).toBe(true);

    const fetched = await service.getProvider("openai");
    expect(fetched.id).toBe(provider.id);
    expect(fetched.displayName).toBe("OpenAI");
  });

  it("rejects duplicate provider creation with 409", async () => {
    await expect(
      service.createProvider(
        {
          code: "openai",
          displayName: "OpenAI Duplicate",
          adapterType: "openai",
          baseUrl: "https://api.openai.com/v1",
        },
        "usr_operator_1",
      ),
    ).rejects.toThrow(GrowXProviderError);
  });

  it("creates encrypted provider credential and stores without plaintext", async () => {
    const rawSecret = "mock-proj-super-sensitive-openai-secret-key-12345";
    const credential = await service.createCredential(
      "openai",
      {
        name: "production-primary",
        environment: "production",
        rawSecret,
      },
      "usr_operator_1",
    );

    expect(credential.id).toMatch(/^pcred_/);
    expect(credential.name).toBe("production-primary");
    expect(credential.encryptedPayload).not.toBe(rawSecret);
    expect(credential.encryptedPayload).toContain("."); // AES-GCM envelope iv.tag.ciphertext

    // Plaintext should not be in serialized metadata
    const metadata = toCredentialMetadata(credential);
    expect((metadata as any).rawSecret).toBeUndefined();
    expect((metadata as any).encryptedPayload).toBeUndefined();

    // Verify it decrypts accurately
    const decrypted = crypto.decrypt(
      credential.encryptedPayload,
      credential.encryptionKeyVersion,
    );
    expect(decrypted).toBe(rawSecret);
  });

  it("updates and disables/enables provider lifecycle status", async () => {
    const updated = await service.updateProvider(
      "openai",
      { displayName: "OpenAI Platform Updated" },
      "usr_operator_1",
    );
    expect(updated.displayName).toBe("OpenAI Platform Updated");

    const disabled = await service.disableProvider("openai", "usr_operator_1");
    expect(disabled.status).toBe("disabled");
    expect(disabled.enabled).toBe(false);

    const enabled = await service.enableProvider("openai", "usr_operator_1");
    expect(enabled.status).toBe("active");
    expect(enabled.enabled).toBe(true);
  });
});
