import type {
  CanonicalToolDefinition,
  CanonicalToolChoice,
  CanonicalToolCall,
  CanonicalToolResult,
} from "@growx/contracts";
import type { ProviderToolAdapter } from "./provider-tool-adapter.js";

export class GeminiToolAdapter implements ProviderToolAdapter {
  readonly providerId = "google";
  readonly continuationMode = "normalized_replay" as const;

  translateTools(tools: CanonicalToolDefinition[]): unknown {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      },
    ];
  }

  translateToolChoice(choice?: CanonicalToolChoice): unknown {
    if (!choice) return undefined;
    if (choice === "auto") return { mode: "AUTO" };
    if (choice === "none") return { mode: "NONE" };
    if (choice === "required") return { mode: "ANY" };
    if (typeof choice === "object" && choice.mode === "tool") {
      return { mode: "ANY", allowedFunctionNames: [choice.name] };
    }
    return undefined;
  }

  parseToolCalls(rawResponse: any, requestId: string): CanonicalToolCall[] {
    const candidate = rawResponse?.candidates?.[0];
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) return [];

    const functionCalls = parts.filter((p: any) => p.functionCall);
    return functionCalls.map((p: any, idx: number) => {
      const fc = p.functionCall;
      return {
        id: `tcall_${idx}_${Date.now()}`,
        requestId,
        providerCallId: `call_${idx}`,
        name: fc.name,
        arguments: (fc.args &&
        typeof fc.args === "object" &&
        !Array.isArray(fc.args)
          ? fc.args
          : {}) as Record<string, unknown>,
        rawArguments: JSON.stringify(fc.args),
        index: idx,
        status: "validated",
      };
    });
  }

  serializeToolResults(results: CanonicalToolResult[]): unknown {
    return {
      role: "function",
      parts: results.map((r) => ({
        functionResponse: {
          name: r.toolCallId,
          response: { content: r.content },
        },
      })),
    };
  }
}
