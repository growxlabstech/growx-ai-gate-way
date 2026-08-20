import { describe, expect, it, beforeEach } from "vitest";
import { ModelRegistryService } from "../../src/application/model-registry-service.js";
import { InMemoryModelRegistryRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryModelRegistryEvents } from "../../src/infrastructure/events.js";

describe("Provider Routes & Pricing Integration Tests", () => {
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
        supportsReasoning: true,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming"],
      },
      "usr_admin"
    );
  });

  it("attaches provider routes to canonical model", async () => {
    const model = (await service.listAdminModels()).items[0]!;

    const route = await service.addProviderRoute(
      {
        modelId: model.id,
        providerId: "prov_openai",
        providerModelId: "gpt-4o-2024-08-06",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_admin"
    );

    expect(route.id).toBeDefined();
    expect(route.providerModelId).toBe("gpt-4o-2024-08-06");
    expect(events.outbox.some((e) => e.topic === "model.route.created")).toBe(true);

    const detail = await service.getAdminModelDetail(model.id);
    expect(detail.routes).toHaveLength(1);
    expect(detail.routes[0]?.id).toBe(route.id);
  });

  it("adds pricing record and queries effective pricing at timestamp", async () => {
    const model = (await service.listAdminModels()).items[0]!;

    const pastDate = new Date(Date.now() - 100_000);
    const pricing = await service.addPricing(
      {
        modelId: model.id,
        inputPricePerMillionMinor: 250, // $2.50 / 1M tokens
        outputPricePerMillionMinor: 1000, // $10.00 / 1M tokens
        cachedInputPricePerMillionMinor: 125,
        currency: "USD",
        effectiveFrom: pastDate,
      },
      "usr_admin"
    );

    expect(pricing.id).toBeDefined();
    expect(pricing.inputPricePerMillionMinor).toBe(250);

    const effective = await service.getEffectivePricing(model.id);
    expect(effective).not.toBeNull();
    expect(effective?.inputPricePerMillionMinor).toBe(250);
  });
});
