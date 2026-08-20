import { createHash } from "node:crypto";
import type { CanonicalToolCall, CanonicalToolDefinition } from "@growx/contracts";
import { JsonSchemaValidator, ToolValidationError } from "./validator.js";

export function computeSha256(data: unknown): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return createHash("sha256").update(str, "utf8").digest("hex");
}

export class ToolCallNormalizer {
  private readonly validator: JsonSchemaValidator;

  constructor() {
    this.validator = new JsonSchemaValidator();
  }

  /**
   * Parses, validates, and normalizes a raw or structured tool call against allowed ToolDefinitions.
   */
  normalizeToolCall(
    rawCall: {
      id?: string;
      providerCallId?: string;
      name: string;
      arguments: unknown;
      index?: number;
    },
    allowedTools: CanonicalToolDefinition[],
    requestId: string
  ): CanonicalToolCall {
    // 1. Verify tool exists in allowed tools
    const toolDef = allowedTools.find((t) => t.name === rawCall.name);
    if (!toolDef) {
      throw new ToolValidationError(`Requested tool '${rawCall.name}' is unknown or not authorized for this request`);
    }

    // 2. Parse arguments if raw string
    let parsedArgs: Record<string, unknown> = {};
    let rawArgumentsString: string | undefined = undefined;

    if (typeof rawCall.arguments === "string") {
      rawArgumentsString = rawCall.arguments;
      try {
        parsedArgs = JSON.parse(rawCall.arguments);
      } catch (err) {
        throw new ToolValidationError(`Invalid JSON in tool '${rawCall.name}' arguments: ${(err as Error).message}`);
      }
    } else if (rawCall.arguments && typeof rawCall.arguments === "object" && !Array.isArray(rawCall.arguments)) {
      parsedArgs = rawCall.arguments as Record<string, unknown>;
      rawArgumentsString = JSON.stringify(rawCall.arguments);
    } else {
      throw new ToolValidationError(`Tool '${rawCall.name}' arguments must be a JSON object`);
    }

    // 3. Validate arguments against exact ToolDefinition.inputSchema
    this.validator.validateData(toolDef.inputSchema, parsedArgs, "$");

    // 4. Generate stable GrowX tool call ID
    const canonicalId = rawCall.id && rawCall.id.startsWith("tcall_")
      ? rawCall.id
      : `tcall_${createHash("sha256").update(`${requestId}:${rawCall.name}:${rawCall.index ?? 0}:${Date.now()}`).digest("hex").slice(0, 24)}`;

    const argumentsHash = computeSha256(parsedArgs);

    return {
      id: canonicalId,
      requestId,
      providerCallId: rawCall.providerCallId ?? rawCall.id,
      name: rawCall.name,
      arguments: parsedArgs,
      rawArguments: rawArgumentsString,
      index: rawCall.index ?? 0,
      status: "validated",
      argumentsHash,
    };
  }
}
