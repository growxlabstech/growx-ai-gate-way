import type {
  CanonicalToolDefinition,
  CanonicalToolChoice,
  CanonicalToolCall,
  CanonicalToolResult,
} from "@growx/contracts";

export interface ProviderToolAdapter {
  readonly providerId: string;
  readonly continuationMode: "provider_stateful" | "normalized_replay";

  translateTools(tools: CanonicalToolDefinition[]): unknown;
  translateToolChoice(choice?: CanonicalToolChoice): unknown;
  parseToolCalls(rawResponse: unknown, requestId: string): CanonicalToolCall[];
  serializeToolResults(results: CanonicalToolResult[]): unknown;
}
