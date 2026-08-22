import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import {
  FileService,
  InMemoryObjectStorageProvider,
  InMemoryFileRepository,
  TruthfulFileScanner,
} from "@growx/storage-service";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";

describe("Phase 25: Multimodal Gateway File Integration & Modality Validation", () => {
  let fixture: TestGatewayFixture;
  let fileService: FileService;
  let storageProvider: InMemoryObjectStorageProvider;
  let gatewayEngineWithFiles: GatewayEngine;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();

    storageProvider = new InMemoryObjectStorageProvider();
    fileService = new FileService(
      storageProvider,
      new InMemoryFileRepository(),
      new TruthfulFileScanner(),
    );

    gatewayEngineWithFiles = new GatewayEngine(
      fixture.modelService,
      fixture.providerService,
      fixture.gatewayRepo,
      fixture.gatewayEvents,
      (fixture.gatewayEngine as any).routeResolver,
      undefined,
      fixture.gatewayEngine.resilienceController,
      fixture.gatewayEngine.quotaEngine,
      fixture.gatewayEngine.tokenEstimator,
      fixture.gatewayEngine.policyEngine,
      fixture.gatewayEngine.usageMetering,
      fixture.gatewayEngine.cacheService,
      undefined, // billing disabled for unit isolation
      undefined,
      undefined,
      fixture.gatewayEngine.semanticCacheService,
      fileService,
    );
  });

  it("1. Successfully executes multimodal chat completion referencing ready GrowX image file", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_multimodal_1",
      workspaceId: "ws_multimodal_1",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // 1. Upload image to FileService
    const createRes = await fileService.createFile(
      { organizationId: auth.organizationId, workspaceId: auth.workspaceId },
      {
        fileName: "sample_chart.png",
        purpose: "image_input",
        mimeType: "image/png",
      },
    );
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    await storageProvider.putObject(createRes.file.storageKey, pngData, {
      contentType: "image/png",
    });
    await fileService.completeUpload(
      { organizationId: auth.organizationId, workspaceId: auth.workspaceId },
      createRes.file.id,
      { uploadSessionId: createRes.uploadSessionId },
    );

    // 2. Execute chat request referencing fileId with gpt-4o-mini
    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is shown in this chart?" },
            {
              type: "file",
              file: {
                fileId: createRes.file.id,
                mimeType: "image/png",
              },
            } as any,
          ],
        },
      ],
      stream: false,
    };

    const response = await gatewayEngineWithFiles.executeChatCompletion(
      auth as any,
      req as any,
    );
    expect(response.choices[0]?.message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls.length).toBe(1);
  });

  it("2. Rejects request when referenced file is NOT ready (e.g. pending upload)", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_multimodal_2",
      workspaceId: "ws_multimodal_2",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // Create file but DO NOT complete upload -> remains 'pending_upload'
    const createRes = await fileService.createFile(
      { organizationId: auth.organizationId, workspaceId: auth.workspaceId },
      {
        fileName: "incomplete.png",
        purpose: "image_input",
        mimeType: "image/png",
      },
    );

    const req: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "file",
              file: {
                fileId: createRes.file.id,
                mimeType: "image/png",
              },
            } as any,
          ],
        },
      ],
      stream: false,
    };

    await expect(
      gatewayEngineWithFiles.executeChatCompletion(auth as any, req as any),
    ).rejects.toThrowError(/is not ready/);

    expect(fixture.mockAdapter.calls.length).toBe(0);
  });

  it("3. Storage provider outage does NOT degrade pure text inference Gateway requests", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_multimodal_3",
      workspaceId: "ws_multimodal_3",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // Simulate storage provider outage
    storageProvider.setOutageSimulation(true);

    const pureTextReq: OpenAIChatCompletionRequest = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "What is 2+2?" }],
      stream: false,
    };

    // Text request succeeds with 0 error and 0 storage calls
    const response = await gatewayEngineWithFiles.executeChatCompletion(
      auth as any,
      pureTextReq as any,
    );
    expect(response.choices[0]?.message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
    expect(fixture.mockAdapter.calls.length).toBe(1);
  });
});
