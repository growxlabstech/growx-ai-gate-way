import type {
  CanonicalToolDefinition,
  CanonicalToolChoice,
  CanonicalToolCall,
  CanonicalToolResult,
} from "@growx/contracts";
import type { ProviderToolAdapter } from "./provider-tool-adapter.js";
import { ToolCallNormalizer } from "../normalizer.js";

export class OpenAIToolAdapter implements ProviderToolAdapter {
  readonly providerId = "openai";
  readonly continuationMode = "normalized_replay" as const;
  private readonly normalizer = new ToolCallNormalizer();

  translateTools(tools: CanonicalToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
        strict: t.strict,
      },
    }));
  }

  translateToolChoice(choice?: CanonicalToolChoice): unknown {
    if (!choice) return undefined;
    if (choice === "auto" || choice === "none" || choice === "required") {
      return choice;
    }
    if (typeof choice === "object" && choice.mode === "tool") {
      return {
        type: "function",
        function: { name: choice.name },
      };
    }
    return undefined;
  }

  parseToolCalls(rawResponse: any, requestId: string): CanonicalToolCall[] {
    const message = rawResponse?.choices?.[0]?.message ?? rawResponse?.message;
    const rawCalls = message?.tool_calls ?? [];
    if (!Array.isArray(rawCalls) || rawCalls.length === 0) return [];

    return rawCalls.map((rc: any, idx: number) => {
      let argsObj: unknown = {};
      try {
        argsObj =
          typeof rc.function?.arguments === "string"
            ? JSON.parse(rc.function.arguments)
            : rc.function?.arguments;
      } catch {
        argsObj = { raw: rc.function?.arguments };
      }

      return {
        id:
          rc.id && rc.id.startsWith("tcall_") ? rc.id : `tcall_${rc.id ?? idx}`,
        requestId,
        providerCallId: rc.id,
        name: rc.function?.name ?? "",
        arguments: (argsObj &&
        typeof argsObj === "object" &&
        !Array.isArray(argsObj)
          ? argsObj
          : {}) as Record<string, unknown>,
        rawArguments:
          typeof rc.function?.arguments === "string"
            ? rc.function.arguments
            : JSON.stringify(rc.function?.arguments),
        index: idx,
        status: "validated",
      };
    });
  }

  serializeToolResults(results: CanonicalToolResult[]): unknown[] {
    return results.map((r) => ({
      role: "tool",
      tool_call_id: r.toolCallId,
      content: r.content,
    }));
  }
}
