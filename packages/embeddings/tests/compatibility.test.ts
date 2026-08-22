import { describe, it, expect } from "vitest";
import {
  EmbeddingCompatibilityManager,
  type RouteVectorIdentity,
} from "../src/compatibility.js";
import { EmbeddingVectorSpaceIncompatibleError } from "../src/types.js";

describe("Embedding Vector Space Compatibility", () => {
  it("considers routes with identical canonicalModelId compatible", () => {
    const route1: RouteVectorIdentity = {
      canonicalModelId: "openai/text-embedding-3-small",
      providerModelId: "text-embedding-3-small",
    };
    const route2: RouteVectorIdentity = {
      canonicalModelId: "openai/text-embedding-3-small",
      providerModelId: "text-embedding-3-small",
    };
    expect(EmbeddingCompatibilityManager.isCompatible(route1, route2)).toBe(
      true,
    );
    expect(() =>
      EmbeddingCompatibilityManager.assertCompatible(route1, route2),
    ).not.toThrow();
  });

  it("considers routes with matching compatibilityGroup compatible", () => {
    const route1: RouteVectorIdentity = {
      canonicalModelId: "openai/text-embedding-3-small",
      providerModelId: "text-embedding-3-small",
      compatibilityGroup: "v3_small_1536_space",
    };
    const route2: RouteVectorIdentity = {
      canonicalModelId: "azure/text-embedding-3-small",
      providerModelId: "text-embedding-3-small",
      compatibilityGroup: "v3_small_1536_space",
    };
    expect(EmbeddingCompatibilityManager.isCompatible(route1, route2)).toBe(
      true,
    );
  });

  it("rejects fallback across different canonical models without explicit compatibility group", () => {
    const route1: RouteVectorIdentity = {
      canonicalModelId: "openai/text-embedding-3-small",
      providerModelId: "text-embedding-3-small",
    };
    const route2: RouteVectorIdentity = {
      canonicalModelId: "openai/text-embedding-ada-002",
      providerModelId: "text-embedding-ada-002",
    };
    expect(EmbeddingCompatibilityManager.isCompatible(route1, route2)).toBe(
      false,
    );
    expect(() =>
      EmbeddingCompatibilityManager.assertCompatible(route1, route2),
    ).toThrow(EmbeddingVectorSpaceIncompatibleError);
  });
});
