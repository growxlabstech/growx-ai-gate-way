import { describe, expect, it, beforeEach } from "vitest";
import { ModelRegistryService } from "../../src/application/model-registry-service.js";
import { InMemoryModelRegistryRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryModelRegistryEvents } from "../../src/infrastructure/events.js";

describe("Model Registry CRUD Integration Tests", () => {
  let repository: InMemoryModelRegistryRepository;
  let events: InMemoryModelRegistryEvents;
  let service: ModelRegistryService;

  beforeEach(() => {
    repository = new InMemoryModelRegistryRepository();
    events = new InMemoryModelRegistryEvents();
    service = new ModelRegistryService(repository, events);
  });

  it("creates a canonical model and emits events", async () => {
    const created = await service.createModel(
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
        capabilities: ["text.generate", "streaming", "tools.call"],
      },
      "usr_admin123",
      "req_test1",
    );

    expect(created.id).toBeDefined();
    expect(created.canonicalId).toBe("openai/gpt-4o");
    expect(created.capabilities).toContain("tools.call");

    // Verify outbox & audit events
    expect(events.outbox).toHaveLength(1);
    expect(events.outbox[0]?.topic).toBe("model.created");
    expect(events.audit).toHaveLength(1);
    expect(events.audit[0]?.action).toBe("create");
  });

  it("prevents creating duplicate canonical ID", async () => {
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
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate"],
      },
      "usr_admin123",
    );

    await expect(
      service.createModel(
        {
          canonicalId: "openai/gpt-4o",
          displayName: "GPT-4o Duplicate",
          family: "gpt",
          category: "chat",
          status: "active",
          customerVisible: true,
          routingEligible: true,
          contextWindow: 128_000,
          maxOutputTokens: 4096,
          supportsStreaming: true,
          supportsTools: false,
          supportsStructuredOutput: false,
          supportsReasoning: false,
          inputModalities: ["text"],
          outputModalities: ["text"],
          capabilities: ["text.generate"],
        },
        "usr_admin123",
      ),
    ).rejects.toThrow(/already exists/);
  });

  it("updates a model and modifies its capabilities", async () => {
    const created = await service.createModel(
      {
        canonicalId: "anthropic/claude-3-5-sonnet",
        displayName: "Claude 3.5 Sonnet",
        family: "claude",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: false,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming"],
      },
      "usr_admin123",
    );

    const updated = await service.updateModel(
      created.id,
      {
        supportsReasoning: true,
        capabilities: ["text.generate", "streaming", "text.reason"],
      },
      "usr_admin123",
    );

    expect(updated.supportsReasoning).toBe(true);
    expect(updated.capabilities).toContain("text.reason");
    expect(events.outbox.some((e) => e.topic === "model.updated")).toBe(true);
  });

  it("disables and deprecates a model through lifecycle methods", async () => {
    const created = await service.createModel(
      {
        canonicalId: "google/gemini-1.5-pro",
        displayName: "Gemini 1.5 Pro",
        family: "gemini",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 1_000_000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: true,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming"],
      },
      "usr_admin123",
    );

    const deprecated = await service.deprecateModel(
      created.id,
      { message: "Please migrate to gemini-2.0-pro" },
      "usr_admin123",
    );
    expect(deprecated.status).toBe("deprecated");
    expect(deprecated.deprecationMessage).toBe(
      "Please migrate to gemini-2.0-pro",
    );

    const disabled = await service.disableModel(created.id, "usr_admin123");
    expect(disabled.status).toBe("disabled");
    expect(disabled.routingEligible).toBe(false);
  });
});
