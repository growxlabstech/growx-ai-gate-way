import { describe, expect, it } from "vitest";
import { ModelRegistry, type ModelRecord } from "../src/registry.js";
const model: ModelRecord = {
  id: "model_a",
  providerId: "openai",
  providerModelId: "gpt",
  publicModelId: "openai/gpt",
  displayName: "GPT",
  description: "",
  status: "active",
  contextWindow: 1000,
  maxOutputTokens: 100,
  capabilities: new Set(["text", "streaming"]),
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe("model registry", () => {
  it("resolves versioned aliases", () =>
    expect(
      new ModelRegistry(
        [model],
        [
          {
            alias: "growx/fast",
            version: "1",
            targets: ["openai/gpt"],
            effectiveFrom: new Date(0),
            effectiveUntil: null,
            status: "active",
          },
        ],
      ).resolve("growx/fast")[0]?.id,
    ).toBe("model_a"));
  it("rejects missing capabilities", () =>
    expect(() =>
      new ModelRegistry([model], []).requireCapabilities(model, ["vision"]),
    ).toThrow(/vision/));
});
