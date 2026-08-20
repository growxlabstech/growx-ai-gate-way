import { describe, expect, it, beforeEach } from "vitest";
import { ModelRegistryService } from "../../src/application/model-registry-service.js";
import { InMemoryModelRegistryRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryModelRegistryEvents } from "../../src/infrastructure/events.js";

describe("Concurrency & Race Conditions Tests", () => {
  let repository: InMemoryModelRegistryRepository;
  let events: InMemoryModelRegistryEvents;
  let service: ModelRegistryService;

  beforeEach(async () => {
    repository = new InMemoryModelRegistryRepository();
    events = new InMemoryModelRegistryEvents();
    service = new ModelRegistryService(repository, events);

    await service.createModel(
      {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 128_000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate"],
      },
      "usr_admin"
    );
  });

  it("handles concurrent route insertions safely", async () => {
    const model = (await service.listAdminModels()).items[0]!;

    const createPromises = Array.from({ length: 10 }, (_, i) =>
      service.addProviderRoute(
        {
          modelId: model.id,
          providerId: `prov_${i}`,
          providerModelId: `gpt-4o-region-${i}`,
          region: `region-${i}`,
          status: "active",
          routingEligible: true,
          priority: 100 + i,
        },
        "usr_admin"
      )
    );

    const routes = await Promise.all(createPromises);
    expect(routes).toHaveLength(10);

    const allRoutes = await service.listAllRoutes();
    expect(allRoutes).toHaveLength(10);
  });

  it("handles concurrent alias creations safely", async () => {
    const aliasPromises = Array.from({ length: 5 }, (_, i) =>
      service.createAlias(
        {
          alias: `alias-${i}`,
          canonicalModelId: "openai/gpt-4o",
          type: "static",
        },
        "usr_admin"
      )
    );

    const aliases = await Promise.all(aliasPromises);
    expect(aliases).toHaveLength(5);

    const allAliases = await service.listAllAliases();
    expect(allAliases).toHaveLength(5);
  });
});
