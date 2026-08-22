import { describe, it, expect } from "vitest";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { ProviderAccountService } from "../../src/vault/provider-account-service.js";

describe("Provider Account Multi-Tenancy & Quotas", () => {
  const repo = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const service = new ProviderAccountService(repo, events);

  it("manages complete account lifecycle (create, update, drain, disable, enable)", async () => {
    // Setup provider
    await repo.createProvider({
      id: "prov_openai",
      code: "openai",
      displayName: "OpenAI",
      adapterType: "openai",
      baseUrl: "https://api.openai.com/v1",
      region: "us",
      priority: 100,
      enabled: true,
      status: "active",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Create account
    const account = await service.createAccount(
      "prov_openai",
      {
        displayName: "OpenAI Enterprise Tier 5",
        externalAccountReference: "org-growx-ent",
        accountType: "enterprise",
        region: "us-east-1",
        residency: "us",
        priority: 150,
        environment: "production",
        metadata: {},
      },
      "usr_admin",
    );

    expect(account.id).toBeDefined();
    expect(account.status).toBe("active");
    expect(account.accountType).toBe("enterprise");

    // 2. Drain account
    const draining = await service.drainAccount(account.id, "usr_admin");
    expect(draining.status).toBe("draining");
    expect(draining.drainingAt).toBeDefined();

    // 3. Disable account
    const disabled = await service.disableAccount(account.id, "usr_admin");
    expect(disabled.status).toBe("disabled");
    expect(disabled.disabledAt).toBeDefined();

    // 4. Enable account
    const enabled = await service.enableAccount(account.id, "usr_admin");
    expect(enabled.status).toBe("active");
  });

  it("manages account-specific capabilities and limits", async () => {
    const account = await service.createAccount(
      "prov_openai",
      {
        displayName: "OpenAI Dedicated Pool",
        accountType: "standard",
        environment: "production",
        priority: 1,
        metadata: {},
      },
      "usr_admin",
    );

    // Set Capability
    const cap = await service.setCapability(account.id, {
      canonicalModelId: "gpt-4o",
      capability: "tools.call",
      enabled: true,
      metadata: {},
    });
    expect(cap.capability).toBe("tools.call");

    const caps = await service.listCapabilities(account.id);
    expect(caps.length).toBe(1);

    // Set Limit
    const lim = await service.setLimit(account.id, {
      limitType: "requests_per_minute",
      limitValue: 10000,
      windowSeconds: 60,
      source: "contract",
    });
    expect(lim.limitValue).toBe(10000);

    const limits = await service.listLimits(account.id);
    expect(limits.length).toBe(1);
  });
});
