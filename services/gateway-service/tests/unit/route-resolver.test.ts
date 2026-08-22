import { describe, expect, it } from "vitest";
import { DeterministicRouteResolver } from "../../src/domain/route-resolver.js";
import type {
  CanonicalModelEntity,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "@growx/model-registry-service";

describe("DeterministicRouteResolver Unit Tests", () => {
  const resolver = new DeterministicRouteResolver();

  const baseModel: CanonicalModelEntity = {
    id: "mod_1",
    canonicalId: "openai/gpt-4o",
    displayName: "GPT-4o",
    family: "gpt",
    category: "chat",
    status: "active",
    customerVisible: true,
    routingEligible: true,
    description: "",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: false,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    capabilities: [
      "text.generate",
      "streaming",
      "tools.call",
      "structured_output",
      "vision.input",
    ],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const primaryRoute: ProviderRouteEntity = {
    id: "route_1",
    modelId: "mod_1",
    canonicalModelId: "openai/gpt-4o",
    providerId: "prov_openai",
    providerModelId: "gpt-4o",
    region: "global",
    status: "active",
    routingEligible: true,
    priority: 100,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("selects primary eligible route deterministically", () => {
    const context: ResolvedModelContext = {
      requestedModelId: "openai/gpt-4o",
      canonicalModelId: "openai/gpt-4o",
      model: baseModel,
      capabilities: baseModel.capabilities,
      limits: {
        contextWindow: 128_000,
        maxInputTokens: null,
        maxOutputTokens: 16_384,
      },
      eligibleConfiguredRoutes: [primaryRoute],
      isExecutable: true,
    };

    const resolved = resolver.resolveRoute(context, ["text.generate"]);
    expect(resolved.canonicalModelId).toBe("openai/gpt-4o");
    expect(resolved.route.providerId).toBe("prov_openai");
  });

  it("throws 400 when model does not support requested capability", () => {
    const context: ResolvedModelContext = {
      requestedModelId: "openai/gpt-4o",
      canonicalModelId: "openai/gpt-4o",
      model: { ...baseModel, supportsTools: false },
      capabilities: ["text.generate"],
      limits: {
        contextWindow: 128_000,
        maxInputTokens: null,
        maxOutputTokens: 16_384,
      },
      eligibleConfiguredRoutes: [primaryRoute],
      isExecutable: true,
    };

    expect(() =>
      resolver.resolveRoute(context, ["text.generate", "tools.call"]),
    ).toThrowError(/does not support tool calling/);
  });

  it("throws 503 when no eligible routes are available", () => {
    const context: ResolvedModelContext = {
      requestedModelId: "openai/gpt-4o",
      canonicalModelId: "openai/gpt-4o",
      model: baseModel,
      capabilities: baseModel.capabilities,
      limits: {
        contextWindow: 128_000,
        maxInputTokens: null,
        maxOutputTokens: 16_384,
      },
      eligibleConfiguredRoutes: [], // No routes
      isExecutable: false,
    };

    expect(() =>
      resolver.resolveRoute(context, ["text.generate"]),
    ).toThrowError(/No eligible provider routes available/);
  });
});
