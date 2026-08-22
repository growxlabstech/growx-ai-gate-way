import { describe, it, expect } from "vitest";
import { ToolCallNormalizer, computeSha256 } from "@growx/tools";
import { ToolLoopDetector, ToolLoopDetectedError } from "@growx/tools";
import { ToolAuthorizationService, ToolAuthorizationError } from "@growx/tools";
import { OpenAIToolAdapter } from "@growx/tools";
import { AnthropicToolAdapter } from "@growx/tools";
import { GeminiToolAdapter } from "@growx/tools";
import { JsonSchemaValidator, ToolValidationError } from "@growx/tools";
import type {
  CanonicalToolDefinition,
  CanonicalToolResult,
  ToolExecutionContext,
} from "@growx/contracts";
import {
  ToolRegistryService,
  InMemoryToolRepository,
  ToolContinuationService,
  InMemoryContinuationRepository,
  ToolExecutorRegistry,
} from "@growx/tool-service";

describe("Phase 30: Tool Calling Lifecycle Integration", () => {
  // Shared fixtures
  const weatherTool: CanonicalToolDefinition = {
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
    strict: true,
    metadata: {},
  };

  const calculatorTool: CanonicalToolDefinition = {
    name: "calculator",
    description: "Evaluate a math expression",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string" },
      },
      required: ["expression"],
    },
    strict: false,
    metadata: {},
  };

  const executionContext: ToolExecutionContext = {
    organizationId: "org_test",
    workspaceId: "ws_test",
    requestId: "req_integration_1",
    toolCallId: "tcall_test_1",
  };

  describe("End-to-End: Provider → Normalize → Validate → Authorize", () => {
    it("OpenAI provider response → canonical tool calls → validated → authorized", () => {
      const adapter = new OpenAIToolAdapter();
      const normalizer = new ToolCallNormalizer();
      const authorizer = new ToolAuthorizationService();

      // 1. Provider returns tool calls
      const openaiResponse = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"city":"Tokyo","unit":"celsius"}',
                  },
                },
              ],
            },
          },
        ],
      };

      // 2. Adapter parses to canonical format
      const parsed = adapter.parseToolCalls(openaiResponse, "req_1");
      expect(parsed.length).toBe(1);
      expect(parsed[0]!.name).toBe("get_weather");

      // 3. Normalizer validates args against tool definition
      const normalized = normalizer.normalizeToolCall(
        {
          id: parsed[0]!.providerCallId || "call_1",
          name: parsed[0]!.name,
          arguments: parsed[0]!.rawArguments,
        },
        [weatherTool],
        "req_1",
      );
      expect(normalized.status).toBe("validated");
      expect(normalized.arguments).toEqual({ city: "Tokyo", unit: "celsius" });

      // 4. Authorization check
      expect(() => {
        authorizer.authorizeExecution(
          {
            name: "get_weather",
            executionMode: "return_to_client",
            organizationId: "org_test",
            status: "active",
          },
          executionContext,
        );
      }).not.toThrow();
    });

    it("Anthropic provider response → canonical tool calls", () => {
      const adapter = new AnthropicToolAdapter();

      const anthropicResponse = {
        content: [
          { type: "text", text: "Let me check the weather." },
          {
            type: "tool_use",
            id: "toolu_xyz",
            name: "get_weather",
            input: { city: "Paris", unit: "celsius" },
          },
        ],
      };

      const parsed = adapter.parseToolCalls(anthropicResponse, "req_2");
      expect(parsed.length).toBe(1);
      expect(parsed[0]!.name).toBe("get_weather");
      expect(parsed[0]!.arguments).toEqual({ city: "Paris", unit: "celsius" });
    });

    it("Gemini provider response → canonical tool calls", () => {
      const adapter = new GeminiToolAdapter();

      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "calculator",
                    args: { expression: "42 * 3" },
                  },
                },
              ],
            },
          },
        ],
      };

      const parsed = adapter.parseToolCalls(geminiResponse, "req_3");
      expect(parsed.length).toBe(1);
      expect(parsed[0]!.name).toBe("calculator");
      expect(parsed[0]!.arguments).toEqual({ expression: "42 * 3" });
    });
  });

  describe("Tool Authorization Boundaries", () => {
    it("rejects cross-tenant tool access", () => {
      const authorizer = new ToolAuthorizationService();

      expect(() => {
        authorizer.authorizeExecution(
          {
            name: "secret_tool",
            executionMode: "return_to_client",
            organizationId: "org_other",
            status: "active",
          },
          executionContext,
        );
      }).toThrow(ToolAuthorizationError);
    });

    it("enforces policy deny over tool name", () => {
      const authorizer = new ToolAuthorizationService();

      expect(() => {
        authorizer.authorizeExecution(
          {
            name: "dangerous_tool",
            executionMode: "return_to_client",
            organizationId: "org_test",
            status: "active",
          },
          executionContext,
          { deniedToolNames: ["dangerous_tool"] },
        );
      }).toThrow(/Policy explicitly denies/);
    });

    it("rejects archived tool execution", () => {
      const authorizer = new ToolAuthorizationService();

      expect(() => {
        authorizer.authorizeExecution(
          {
            name: "old_tool",
            executionMode: "return_to_client",
            organizationId: "org_test",
            status: "archived",
          },
          executionContext,
        );
      }).toThrow(/archived/);
    });
  });

  describe("Loop Detection", () => {
    it("detects infinite tool call loop", () => {
      const detector = new ToolLoopDetector({
        maxConsecutiveIdenticalCalls: 3,
        maxRounds: 10,
        maxTotalCalls: 20,
      });

      const hash = computeSha256({ city: "Tokyo" });
      detector.recordCall("get_weather", hash);
      detector.recordCall("get_weather", hash);

      expect(() => {
        detector.recordCall("get_weather", hash);
      }).toThrow(ToolLoopDetectedError);
    });

    it("allows varied tool calls within limits", () => {
      const detector = new ToolLoopDetector({
        maxConsecutiveIdenticalCalls: 3,
        maxRounds: 5,
        maxTotalCalls: 10,
      });

      detector.recordCall("tool_a", "hash_1");
      detector.recordCall("tool_b", "hash_2");
      detector.recordCall("tool_a", "hash_3"); // Different hash
      detector.recordCall("tool_c", "hash_4");

      expect(detector.getMetrics().totalCalls).toBe(4);
    });
  });

  describe("Tool Registry Service", () => {
    it("creates tool with version and retrieves it", async () => {
      const registry = new ToolRegistryService(new InMemoryToolRepository());

      const entry = await registry.createTool({
        organizationId: "org_test",
        key: "search_docs",
        name: "Search Documents",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        createdBy: "user_1",
      });

      expect(entry.tool.id).toMatch(/^tool_/);

      const retrieved = await registry.getTool(entry.tool.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.tool.key).toBe("search_docs");
      expect(retrieved!.activeVersion.version).toBe(1);
    });
  });

  describe("Continuation Service", () => {
    it("creates, resolves, and completes continuations", async () => {
      const contService = new ToolContinuationService(
        new InMemoryContinuationRepository(),
      );

      const cont = await contService.createContinuation({
        requestId: "req_cont_1",
        organizationId: "org_test",
        providerId: "openai",
        routeId: "route_1",
        modelId: "gpt-4o",
      });

      expect(cont.status).toBe("pending");

      const resolved = await contService.resolveContinuation("req_cont_1");
      expect(resolved!.id).toBe(cont.id);

      await contService.completeContinuation(cont.id);

      const afterComplete = await contService.resolveContinuation("req_cont_1");
      expect(afterComplete).toBeNull();
    });
  });

  describe("Provider Tool Translation Correctness", () => {
    it("OpenAI tool translation round-trips correctly", () => {
      const adapter = new OpenAIToolAdapter();

      const translated = adapter.translateTools([weatherTool]) as any[];
      expect(translated[0].type).toBe("function");
      expect(translated[0].function.name).toBe("get_weather");
      expect(translated[0].function.parameters.required).toEqual(["city"]);

      const choiceAuto = adapter.translateToolChoice("auto");
      expect(choiceAuto).toBe("auto");

      const choiceSpecific = adapter.translateToolChoice({
        mode: "tool",
        name: "get_weather",
      });
      expect((choiceSpecific as any).type).toBe("function");
      expect((choiceSpecific as any).function.name).toBe("get_weather");
    });

    it("Anthropic tool choice maps correctly", () => {
      const adapter = new AnthropicToolAdapter();

      const auto = adapter.translateToolChoice("auto") as any;
      expect(auto.type).toBe("auto");

      const required = adapter.translateToolChoice("required") as any;
      expect(required.type).toBe("any");

      const specific = adapter.translateToolChoice({
        mode: "tool",
        name: "calculator",
      }) as any;
      expect(specific.type).toBe("tool");
      expect(specific.name).toBe("calculator");
    });

    it("Gemini functionDeclarations formatted correctly", () => {
      const adapter = new GeminiToolAdapter();

      const translated = adapter.translateTools([
        weatherTool,
        calculatorTool,
      ]) as any[];
      expect(translated[0].functionDeclarations).toHaveLength(2);
      expect(translated[0].functionDeclarations[0].name).toBe("get_weather");
      expect(translated[0].functionDeclarations[1].name).toBe("calculator");

      const required = adapter.translateToolChoice("required") as any;
      expect(required.mode).toBe("ANY");
    });
  });

  describe("Tool Result Serialization", () => {
    it("OpenAI result serialization", () => {
      const adapter = new OpenAIToolAdapter();
      const results: CanonicalToolResult[] = [
        {
          toolCallId: "tcall_123",
          status: "success",
          content: "72°F and sunny",
        },
      ];

      const serialized = adapter.serializeToolResults(results) as any[];
      expect(serialized[0].role).toBe("tool");
      expect(serialized[0].tool_call_id).toBe("tcall_123");
      expect(serialized[0].content).toBe("72°F and sunny");
    });

    it("Anthropic result serialization with error", () => {
      const adapter = new AnthropicToolAdapter();
      const results: CanonicalToolResult[] = [
        {
          toolCallId: "tcall_456",
          status: "error",
          content: "Tool execution failed",
        },
      ];

      const serialized = adapter.serializeToolResults(results) as any;
      expect(serialized.role).toBe("user");
      expect(serialized.content[0].type).toBe("tool_result");
      expect(serialized.content[0].is_error).toBe(true);
    });
  });

  describe("Argument Validation Boundary", () => {
    it("rejects unknown tool", () => {
      const normalizer = new ToolCallNormalizer();
      expect(() => {
        normalizer.normalizeToolCall(
          { name: "nonexistent_tool", arguments: "{}" },
          [weatherTool],
          "req_4",
        );
      }).toThrow(/unknown or not authorized/);
    });

    it("rejects invalid JSON arguments", () => {
      const normalizer = new ToolCallNormalizer();
      expect(() => {
        normalizer.normalizeToolCall(
          { name: "get_weather", arguments: "not valid json{" },
          [weatherTool],
          "req_5",
        );
      }).toThrow(/Invalid JSON/);
    });

    it("rejects missing required properties", () => {
      const normalizer = new ToolCallNormalizer();
      expect(() => {
        normalizer.normalizeToolCall(
          { name: "get_weather", arguments: '{"unit":"celsius"}' },
          [weatherTool],
          "req_6",
        );
      }).toThrow(/Missing required/);
    });
  });
});
