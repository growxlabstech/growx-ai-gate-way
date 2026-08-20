import { describe, expect, it } from "vitest";
import {
  eligibleConfiguredRoutes,
  isModelExecutable,
  modelSupports,
  resolveModelContext,
  routeSupports,
} from "../../src/domain/resolver.js";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ProviderRouteEntity,
} from "../../src/domain/types.js";

const mockModel: CanonicalModelEntity = {
  id: "mod_gpt4o",
  canonicalId: "openai/gpt-4o",
  displayName: "GPT-4o",
  family: "gpt",
  category: "chat",
  status: "active",
  customerVisible: true,
  routingEligible: true,
  description: "Flagship omnichannel model",
  contextWindow: 128_000,
  maxInputTokens: 124_000,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsTools: true,
  supportsStructuredOutput: true,
  supportsReasoning: true,
  inputModalities: ["text", "image"],
  outputModalities: ["text"],
  capabilities: ["text.generate", "text.reason", "tools.call", "structured_output", "vision.input", "streaming"],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoute: ProviderRouteEntity = {
  id: "route_openai_direct",
  modelId: "mod_gpt4o",
  canonicalModelId: "openai/gpt-4o",
  providerId: "prov_openai",
  providerModelId: "gpt-4o-2024-08-06",
  region: "global",
  status: "active",
  routingEligible: true,
  priority: 100,
  contextWindowOverride: null,
  maxOutputTokensOverride: null,
  capabilitiesOverrides: null,
  pricingReference: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAlias: ModelAliasEntity = {
  id: "alias_fast",
  alias: "growx/fast",
  canonicalModelId: "openai/gpt-4o",
  status: "active",
  type: "static",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Canonical Model Resolver Unit Tests", () => {
  it("resolves canonical model by exact canonical ID", () => {
    const resolved = resolveModelContext(
      "openai/gpt-4o",
      [mockModel],
      [],
      [mockRoute]
    );

    expect(resolved.canonicalModelId).toBe("openai/gpt-4o");
    expect(resolved.model.id).toBe("mod_gpt4o");
    expect(resolved.isExecutable).toBe(true);
    expect(resolved.eligibleConfiguredRoutes).toHaveLength(1);
    expect(resolved.aliasUsed).toBeUndefined();
  });

  it("resolves canonical model through alias", () => {
    const resolved = resolveModelContext(
      "growx/fast",
      [mockModel],
      [mockAlias],
      [mockRoute]
    );

    expect(resolved.canonicalModelId).toBe("openai/gpt-4o");
    expect(resolved.aliasUsed).toEqual({ alias: "growx/fast", type: "static" });
    expect(resolved.isExecutable).toBe(true);
  });

  it("throws 404 model_not_found for unknown model", () => {
    expect(() =>
      resolveModelContext("unknown/model", [mockModel], [], [mockRoute])
    ).toThrow(/not found in canonical model registry/);
  });

  it("throws 403 model_disabled for disabled model", () => {
    const disabledModel: CanonicalModelEntity = {
      ...mockModel,
      id: "mod_disabled",
      canonicalId: "anthropic/claude-disabled",
      status: "disabled",
      routingEligible: false,
    };

    expect(() =>
      resolveModelContext("anthropic/claude-disabled", [disabledModel], [], [])
    ).toThrow(/is currently disabled/);
  });

  it("throws 410 model_retired for retired model", () => {
    const retiredModel: CanonicalModelEntity = {
      ...mockModel,
      id: "mod_retired",
      canonicalId: "google/gemini-1.0-pro",
      status: "retired",
      routingEligible: false,
    };

    expect(() =>
      resolveModelContext("google/gemini-1.0-pro", [retiredModel], [], [])
    ).toThrow(/is retired and no longer available/);
  });

  it("evaluates capabilities correctly via modelSupports", () => {
    expect(modelSupports(mockModel, "streaming")).toBe(true);
    expect(modelSupports(mockModel, "tools.call")).toBe(true);
    expect(modelSupports(mockModel, "vision.input")).toBe(true);
    expect(modelSupports(mockModel, "video.input")).toBe(false);
  });

  it("evaluates route capability overrides via routeSupports", () => {
    const routeWithOverride: ProviderRouteEntity = {
      ...mockRoute,
      capabilitiesOverrides: ["text.generate", "streaming"],
    };

    expect(routeSupports(mockRoute, mockModel, "tools.call")).toBe(true);
    expect(routeSupports(routeWithOverride, mockModel, "tools.call")).toBe(false);
    expect(routeSupports(routeWithOverride, mockModel, "streaming")).toBe(true);
  });

  it("correctly identifies non-executable model when no routes are active", () => {
    const inactiveRoute: ProviderRouteEntity = {
      ...mockRoute,
      status: "disabled",
    };

    const eligible = eligibleConfiguredRoutes(mockModel, [inactiveRoute]);
    expect(eligible).toHaveLength(0);
    expect(isModelExecutable(mockModel, [inactiveRoute])).toBe(false);
  });
});
