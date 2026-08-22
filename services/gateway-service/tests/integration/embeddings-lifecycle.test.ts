import { describe, it, expect, beforeEach } from "vitest";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type { MachineAuthContext } from "@growx/api-key-service";
import { decodeBase64ToFloat32 } from "@growx/embeddings";

function createMockAuth(
  overrides: Partial<MachineAuthContext> = {},
): MachineAuthContext {
  return {
    actorType: "apiKey",
    apiKeyId: "key_test_embed_123",
    organizationId: "org_gw_embed",
    workspaceId: "ws_test_123",
    environmentId: "env_test_123",
    environment: "production",
    permissions: [
      "embeddings.create",
      "chat.completions.create",
      "responses.create",
      "models.read",
    ],
    modelRules: [],
    rateLimits: [],
    ...overrides,
  } as MachineAuthContext;
}

describe("Embeddings Infrastructure V2 Integration", () => {
  let fixture: TestGatewayFixture;
  let engine: GatewayEngine;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    engine = fixture.gatewayEngine;

    // Seed canonical embedding models into model registry fixture
    const v3Model = await fixture.modelService.createModel(
      {
        canonicalId: "openai/text-embedding-3-small",
        displayName: "Text Embedding 3 Small",
        family: "text-embedding-3",
        category: "embeddings",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 8192,
        maxOutputTokens: 1536,
        supportsStreaming: false,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        capabilities: ["embeddings.create" as any],
        inputModalities: ["text"],
        outputModalities: ["embeddings" as any],
        metadata: {
          embedding: {
            defaultDimensions: 1536,
            dimensionControl: true,
            minDimensions: 256,
            maxDimensions: 1536,
            supportedDimensions: [256, 512, 1024, 1536],
            encodingFormats: ["float", "base64"],
            maxBatchItems: 2048,
            maxInputTokensPerItem: 8192,
            normalizedVector: true,
            distanceRecommendations: ["cosine"],
          },
        },
      },
      "usr_operator",
    );

    await fixture.modelService.addProviderRoute(
      {
        modelId: v3Model.id,
        providerId: "mock-openai",
        providerModelId: "text-embedding-3-small",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_operator",
    );

    const adaModel = await fixture.modelService.createModel(
      {
        canonicalId: "openai/text-embedding-ada-002",
        displayName: "Ada 002 Embedding",
        family: "text-embedding-ada",
        category: "embeddings",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 8192,
        maxOutputTokens: 1536,
        supportsStreaming: false,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        capabilities: ["embeddings.create" as any],
        inputModalities: ["text"],
        outputModalities: ["embeddings" as any],
        metadata: {
          embedding: {
            defaultDimensions: 1536,
            dimensionControl: false,
            encodingFormats: ["float"],
            maxBatchItems: 2048,
            maxInputTokensPerItem: 8192,
            normalizedVector: true,
            distanceRecommendations: ["cosine"],
          },
        },
      },
      "usr_operator",
    );

    await fixture.modelService.addProviderRoute(
      {
        modelId: adaModel.id,
        providerId: "mock-openai",
        providerModelId: "text-embedding-ada-002",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_operator",
    );
  });

  it("generates embeddings for single string input in float format", async () => {
    const auth = createMockAuth();
    const response = await engine.executeEmbedding(auth, {
      model: "openai/text-embedding-3-small",
      input: "GrowX AI is an enterprise AI gateway.",
      encoding_format: "float",
    });

    expect(response).toBeDefined();
    expect(response.object).toBe("list");
    expect(response.model).toBe("openai/text-embedding-3-small");
    expect(response.data.length).toBe(1);
    expect(response.data[0]!.index).toBe(0);
    expect(response.data[0]!.object).toBe("embedding");
    expect(Array.isArray(response.data[0]!.embedding)).toBe(true);

    const vec = response.data[0]!.embedding as number[];
    expect(vec.length).toBe(1536);
    expect(response.usage.prompt_tokens).toBeGreaterThan(0);
    expect(response.usage.total_tokens).toBe(response.usage.prompt_tokens);
  });

  it("generates embeddings for batch array input with index preservation", async () => {
    const auth = createMockAuth();
    const inputs = ["First sentence", "Second query", "Third document snippet"];
    const response = await engine.executeEmbedding(auth, {
      model: "openai/text-embedding-3-small",
      input: inputs,
      encoding_format: "float",
    });

    expect(response.data.length).toBe(3);
    expect(response.data.map((d) => d.index)).toEqual([0, 1, 2]);
    for (const item of response.data) {
      expect((item.embedding as number[]).length).toBe(1536);
    }
  });

  it("supports base64 IEEE 754 encoding format", async () => {
    const auth = createMockAuth();
    const response = await engine.executeEmbedding(auth, {
      model: "openai/text-embedding-3-small",
      input: "Vector binary encoding test",
      encoding_format: "base64",
    });

    expect(response.data.length).toBe(1);
    expect(typeof response.data[0]!.embedding).toBe("string");

    const decoded = decodeBase64ToFloat32(
      response.data[0]!.embedding as string,
    );
    expect(decoded.length).toBe(1536);
  });

  it("honors custom dimensions on models supporting dimension control", async () => {
    const auth = createMockAuth();
    const response = await engine.executeEmbedding(auth, {
      model: "openai/text-embedding-3-small",
      input: "Shortened embedding vector test",
      dimensions: 512,
      encoding_format: "float",
    });

    expect(response.data.length).toBe(1);
    const vec = response.data[0]!.embedding as number[];
    expect(vec.length).toBe(512);
  });

  it("rejects custom dimensions on models with fixed dimensions", async () => {
    const auth = createMockAuth();
    await expect(
      engine.executeEmbedding(auth, {
        model: "openai/text-embedding-ada-002",
        input: "Invalid custom dimension",
        dimensions: 512,
      }),
    ).rejects.toThrow(/does not support dimension customization/);
  });

  it("rejects non-embedding models on embeddings endpoint", async () => {
    const auth = createMockAuth();
    await expect(
      engine.executeEmbedding(auth, {
        model: "openai/gpt-4o-mini",
        input: "Try to embed with chat completion model",
      }),
    ).rejects.toThrow(/not an embedding model/);
  });

  it("rejects requests when API key lacks embeddings.create permission", async () => {
    const auth = createMockAuth({
      permissions: ["chat.completions.create"], // missing embeddings.create
    });

    await expect(
      engine.executeEmbedding(auth, {
        model: "openai/text-embedding-3-small",
        input: "Test missing permission",
      }),
    ).rejects.toThrow(/API key lacks 'embeddings.create' capability/);
  });

  it("rejects empty string inputs and empty arrays", async () => {
    const auth = createMockAuth();
    await expect(
      engine.executeEmbedding(auth, {
        model: "openai/text-embedding-3-small",
        input: "   ",
      }),
    ).rejects.toThrow(/Input string must not be empty/);

    await expect(
      engine.executeEmbedding(auth, {
        model: "openai/text-embedding-3-small",
        input: [],
      }),
    ).rejects.toThrow(/Input array must not be empty/);
  });
});
