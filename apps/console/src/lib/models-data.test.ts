import { describe, expect, it } from "vitest";
import {
  loadWorkspaceModels,
  loadWorkspaceModel,
  CANONICAL_GROWX_MODELS,
} from "./models-data";

describe("D5 Models Data Layer", () => {
  it("loads canonical GrowX models with rich capability metadata", async () => {
    const models = await loadWorkspaceModels({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
    });

    expect(models.length).toBeGreaterThanOrEqual(7);

    const fastRouter = models.find((m) => m.id === "growx/fast");
    expect(fastRouter).toBeDefined();
    expect(fastRouter?.supportsStreaming).toBe(true);
    expect(fastRouter?.supportsTools).toBe(true);
    expect(fastRouter?.supportsReasoning).toBe(true);
    expect(fastRouter?.contextWindowFormatted).toBe("128K");

    const gpt4o = models.find((m) => m.id === "openai/gpt-4o");
    expect(gpt4o?.supportsStructuredOutput).toBe(true);
    expect(gpt4o?.inputModalities).toContain("image");
  });

  it("filters models by search query", async () => {
    const sonnet = await loadWorkspaceModels({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { search: "sonnet" },
    });

    expect(sonnet.length).toBe(1);
    expect(sonnet[0]?.id).toBe("anthropic/claude-3-5-sonnet");
  });

  it("filters models by capability", async () => {
    const visionModels = await loadWorkspaceModels({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { capability: "vision" },
    });

    expect(visionModels.length).toBeGreaterThanOrEqual(3);
    for (const m of visionModels) {
      expect(m.inputModalities).toContain("image");
    }

    const embeddingsModels = await loadWorkspaceModels({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { capability: "embeddings" },
    });
    expect(embeddingsModels.length).toBe(2);
    expect(embeddingsModels.every((m) => m.category === "embeddings")).toBe(
      true,
    );
  });

  it("loads single model detail correctly", async () => {
    const gemini = await loadWorkspaceModel({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      modelId: "google/gemini-1.5-pro",
    });

    expect(gemini).toBeDefined();
    expect(gemini?.displayName).toBe("Gemini 1.5 Pro");
    expect(gemini?.contextWindow).toBe(2000000);
    expect(gemini?.contextWindowFormatted).toBe("2M");
  });

  it("isolates disabled models when availabilityOnly is true", async () => {
    const availableOnly = await loadWorkspaceModels({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { availabilityOnly: true },
    });

    expect(
      availableOnly.every(
        (m) => m.isAvailableInWorkspace && m.status === "active",
      ),
    ).toBe(true);
    expect(availableOnly.find((m) => m.status === "disabled")).toBeUndefined();
  });
});
