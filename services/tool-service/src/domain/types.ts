import type {
  RegisteredTool,
  RegisteredToolVersion,
  CanonicalToolCall,
  CanonicalToolResult,
  ToolExecutionContext,
  ToolContinuation,
  ToolExecutionRecord,
} from "@growx/contracts";

export interface ToolRegistryEntry {
  tool: RegisteredTool;
  activeVersion: RegisteredToolVersion;
}

export interface ToolExecutionOutcome {
  toolCallId: string;
  status: "succeeded" | "failed" | "cancelled";
  result?: CanonicalToolResult;
  error?: { code: string; message: string };
  durationMs: number;
}

export interface ToolServiceConfig {
  maxRounds: number;
  maxTotalCalls: number;
  maxConsecutiveIdenticalCalls: number;
  continuationTtlMs: number;
  maxSchemaBytes: number;
  maxSchemaDepth: number;
  enablePlatformManaged: boolean;
}

export const DEFAULT_TOOL_SERVICE_CONFIG: ToolServiceConfig = {
  maxRounds: 10,
  maxTotalCalls: 20,
  maxConsecutiveIdenticalCalls: 3,
  continuationTtlMs: 3_600_000,
  maxSchemaBytes: 65_536,
  maxSchemaDepth: 8,
  enablePlatformManaged: false,
};
