import { describe, it, expect, beforeEach } from "vitest";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import {
  InMemoryPromptRepository,
  InMemoryPromptEvents,
  PromptService,
  PromptResolver,
} from "@growx/prompt-service";
import type { MachineAuthContext } from "@growx/api-key-service";

function createMockAuth(
  overrides: Partial<MachineAuthContext> = {},
): MachineAuthContext {
  return {
    actorType: "apiKey",
    apiKeyId: "key_test_123",
    organizationId: "org_gw_prompt",
    workspaceId: "ws_test_123",
    environmentId: "env_test_123",
    environment: "production",
    permissions: ["chat.completions.create", "responses.create", "models.read"],
    modelRules: [],
    rateLimits: [],
    ...overrides,
  } as MachineAuthContext;
}

describe("Gateway Engine Prompt Management Integration", () => {
  let fixture: TestGatewayFixture;
  let engine: GatewayEngine;
  let promptRepo: InMemoryPromptRepository;
  let promptEvents: InMemoryPromptEvents;
  let promptResolver: PromptResolver;
  let promptService: PromptService;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    promptRepo = new InMemoryPromptRepository();
    promptEvents = new InMemoryPromptEvents();
    promptResolver = new PromptResolver(promptRepo);
    promptService = new PromptService(promptRepo, promptEvents, promptResolver);

    engine = new GatewayEngine(
      fixture.modelService,
      fixture.providerService,
      fixture.gatewayRepo,
      fixture.gatewayEvents,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      promptResolver,
    );
  });

  it("executes chat completion with registered prompt template and variables", async () => {
    const auth = createMockAuth({ organizationId: "org_gw_prompt" });

    // 1. Create prompt and release V1
    const { prompt } = await promptService.createPrompt(
      "org_gw_prompt",
      undefined,
      {
        key: "support.reply",
        name: "Support Auto Reply",
      },
      "usr_test",
    );

    const v1 = await promptService.createVersion(
      "org_gw_prompt",
      prompt.id,
      {
        messages: [
          {
            role: "system",
            contentTemplate: "You are support agent for {{company}}.",
          },
          {
            role: "user",
            contentTemplate: "Help {{customer_name}} with: {{issue}}",
          },
        ],
        variableSchema: [
          {
            name: "company",
            type: "string",
            required: true,
            defaultValue: "GrowX",
          },
          { name: "customer_name", type: "string", required: true },
          { name: "issue", type: "string", required: true },
        ],
        preferredModelFamily: "gpt-4o",
      },
      "usr_test",
    );

    await promptService.createRelease(
      "org_gw_prompt",
      prompt.id,
      {
        promptVersionId: v1.id,
        environment: "production",
      },
      "usr_test",
      true,
    );

    // 2. Execute Gateway request with prompt binding
    const response = await engine.executeChatCompletion(auth, {
      model: "openai/gpt-4o-mini",
      stream: false,
      messages: [],
      prompt: {
        key: "support.reply",
        environment: "production",
        variables: {
          customer_name: "Alice",
          issue: "Cannot reset password",
        },
      },
    });

    expect(response).toBeDefined();
    expect(response.id).toBeDefined();
    expect(response.choices.length).toBeGreaterThan(0);
  });

  it("fails fast when required prompt variables are missing", async () => {
    const auth = createMockAuth({ organizationId: "org_gw_prompt" });

    const { prompt } = await promptService.createPrompt(
      "org_gw_prompt",
      undefined,
      {
        key: "strict.prompt",
        name: "Strict Prompt",
      },
      "usr_test",
    );

    const v1 = await promptService.createVersion(
      "org_gw_prompt",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "Code: {{code}}" }],
        variableSchema: [{ name: "code", type: "string", required: true }],
      },
      "usr_test",
    );

    await promptService.createRelease(
      "org_gw_prompt",
      prompt.id,
      {
        promptVersionId: v1.id,
        environment: "production",
      },
      "usr_test",
      true,
    );

    // Missing 'code' variable
    await expect(
      engine.executeChatCompletion(auth, {
        model: "openai/gpt-4o-mini",
        stream: false,
        messages: [],
        prompt: {
          key: "strict.prompt",
          variables: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("supports pinned version execution alongside active release", async () => {
    const auth = createMockAuth({ organizationId: "org_gw_prompt" });

    const { prompt } = await promptService.createPrompt(
      "org_gw_prompt",
      undefined,
      {
        key: "versioned.agent",
        name: "Versioned Agent",
      },
      "usr_test",
    );

    const v1 = await promptService.createVersion(
      "org_gw_prompt",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "V1: {{input}}" }],
        variableSchema: [{ name: "input", type: "string", required: true }],
      },
      "usr_test",
    );

    const v2 = await promptService.createVersion(
      "org_gw_prompt",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "V2: {{input}}" }],
        variableSchema: [{ name: "input", type: "string", required: true }],
      },
      "usr_test",
    );

    await promptService.createRelease(
      "org_gw_prompt",
      prompt.id,
      {
        promptVersionId: v2.id,
        environment: "production",
      },
      "usr_test",
      true,
    );

    // Explicitly pin to Version 1
    const resPinned = await engine.executeChatCompletion(auth, {
      model: "openai/gpt-4o-mini",
      stream: false,
      messages: [],
      prompt: {
        key: "versioned.agent",
        version: 1,
        variables: { input: "test" },
      },
    });
    expect(resPinned).toBeDefined();

    // Default to active release (Version 2)
    const resActive = await engine.executeChatCompletion(auth, {
      model: "openai/gpt-4o-mini",
      stream: false,
      messages: [],
      prompt: {
        key: "versioned.agent",
        variables: { input: "test" },
      },
    });
    expect(resActive).toBeDefined();
  });

  it("maintains raw prompt compatibility when prompt field is omitted", async () => {
    const auth = createMockAuth();

    const response = await engine.executeChatCompletion(auth, {
      model: "openai/gpt-4o-mini",
      stream: false,
      messages: [
        { role: "user", content: "Direct raw message without registry" },
      ],
    });

    expect(response).toBeDefined();
    expect(response.choices.length).toBeGreaterThan(0);
  });
});
