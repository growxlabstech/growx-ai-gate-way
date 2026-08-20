import type {
  CanonicalToolDefinition,
  CanonicalToolChoice,
  CanonicalToolCall,
  CanonicalToolResult,
} from "@growx/contracts";
import type { ProviderToolAdapter } from "./provider-tool-adapter.js";

export class AnthropicToolAdapter implements ProviderToolAdapter {
  readonly providerId = "anthropic";
  readonly continuationMode = "normalized_replay" as const;

  translateTools(tools: CanonicalToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  translateToolChoice(choice?: CanonicalToolChoice): unknown {
    if (!choice) return undefined;
    if (choice === "auto") return { type: "auto" };
    if (choice === "none") return undefined;
    if (choice === "required") return { type: "any" };
    if (typeof choice === "object" && choice.mode === "tool") {
      return { type: "tool", name: choice.name };
    }
    return undefined;
  }

  parseToolCalls(rawResponse: any, requestId: string): CanonicalToolCall[] {
    const content = rawResponse?.content;
    if (!Array.isArray(content)) return [];

    const toolUseBlocks = content.filter((b: any) => b.type === "tool_use");
    return toolUseBlocks.map((b: any, idx: number) => ({
      id: b.id && b.id.startsWith("tcall_") ? b.id : `tcall_${b.id ?? idx}`,
      requestId,
      providerCallId: b.id,
      name: b.name,
      arguments: (b.input && typeof b.input === "object" && !Array.isArray(b.input) ? b.input : {}) as Record<string, unknown>,
      rawArguments: JSON.stringify(b.input),
      index: idx,
      status: "validated",
    }));
  }

  serializeToolResults(results: CanonicalToolResult[]): unknown {
    return {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolCallId,
        content: r.content,
        is_error: r.status === "error",
      })),
    };
  }
}
