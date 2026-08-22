export type ExecutionState =
  "idle" | "submitting" | "streaming" | "completed" | "failed" | "cancelled";

export type MessageRole = "system" | "user" | "assistant";

export interface PlaygroundFileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string | undefined;
}

export interface PlaygroundMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachment?: PlaygroundFileAttachment | undefined;
}

export interface PlaygroundParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
  seed?: number | undefined;
  stop: string[];
  reasoningEffort?: "low" | "medium" | "high" | undefined;
}

export interface PlaygroundToolDefinition {
  id: string;
  name: string;
  description: string;
  parametersJson: string;
  isValid: boolean;
  errorMessage?: string | undefined;
}

export interface PlaygroundStructuredOutput {
  enabled: boolean;
  name: string;
  description?: string | undefined;
  strict: boolean;
  schemaJson: string;
  isValid: boolean;
  errorMessage?: string | undefined;
}

export interface PlaygroundTelemetry {
  requestId: string | null;
  status: number | null;
  totalLatencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  costFormatted: string | null;
  modelUsed: string | null;
}

export interface ToolCallItem {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamEventLog {
  id: string;
  timestamp: number;
  type: "delta" | "tool_call" | "usage" | "error" | "done";
  summary: string;
  raw: any;
}
