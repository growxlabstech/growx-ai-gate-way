import type { TokenEstimate } from "./types.js";

export interface MessageInput {
  role?: string;
  content?:
    | string
    | Array<{ type: string; text?: string; image_url?: unknown }>
    | unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ModelMetadataInput {
  contextWindow?: number;
  maxOutputTokens?: number;
  family?: string;
}

export interface EstimationRequestInput {
  messages?: MessageInput[];
  tools?: unknown[];
  system?: string;
  prompt?: string;
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  stream?: boolean;
}

export class TokenEstimator {
  /**
   * Estimates the input tokens of an incoming LLM request based on message lengths,
   * system instructions, and tool definitions.
   * Uses conservative heuristic (~3.8 characters/token + per-message structural framing overhead).
   */
  estimateInput(
    request: EstimationRequestInput,
    _model?: ModelMetadataInput,
  ): number {
    let charCount = 0;
    let messageOverhead = 0;

    // Prompt string (e.g. legacy completions)
    if (typeof request.prompt === "string") {
      charCount += request.prompt.length;
    }

    // System instruction
    if (typeof request.system === "string") {
      charCount += request.system.length;
      messageOverhead += 4;
    }

    // Chat messages
    if (Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        messageOverhead += 4; // Framing per message: <|im_start|>role\n ... <|im_end|>

        if (typeof msg.name === "string") {
          charCount += msg.name.length;
        }

        if (typeof msg.content === "string") {
          charCount += msg.content.length;
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part && typeof part === "object") {
              if (typeof (part as any).text === "string") {
                charCount += (part as any).text.length;
              } else if ((part as any).type === "image_url") {
                // High-resolution/standard image estimated at ~85–500 tokens
                charCount += 1200; // ~300 tokens equivalent
              }
            }
          }
        }

        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            charCount += JSON.stringify(tc).length;
          }
        }
      }
    }

    // Tool schemas
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      charCount += JSON.stringify(request.tools).length;
    }

    // Conservative estimation: ~3.8 characters per token, minimum 1 token
    const textTokens = Math.ceil(charCount / 3.8);
    const totalTokens = Math.max(1, textTokens + messageOverhead);

    return totalTokens;
  }

  /**
   * Estimates conservative output token reservation before provider execution.
   * If customer requested explicit max_completion_tokens / max_tokens, uses that.
   * Otherwise uses conservative default (e.g., 512 or min(1024, model.maxOutputTokens)).
   */
  estimateOutputReservation(
    request: EstimationRequestInput,
    model?: ModelMetadataInput,
  ): { reservation: number; source: "explicit_max_tokens" | "heuristic" } {
    const explicit = request.max_completion_tokens ?? request.max_tokens;
    if (typeof explicit === "number" && explicit > 0) {
      return { reservation: explicit, source: "explicit_max_tokens" };
    }

    const modelMax = model?.maxOutputTokens ?? 4096;
    // Default safe reservation: 512 tokens or 25% of model max, capped at 1024
    const defaultReservation = Math.min(
      1024,
      Math.max(256, Math.floor(modelMax * 0.25)),
    );

    return { reservation: defaultReservation, source: "heuristic" };
  }

  /**
   * Produces a full TokenEstimate for quota reservation.
   */
  estimate(
    request: EstimationRequestInput,
    model?: ModelMetadataInput,
  ): TokenEstimate {
    const inputTokens = this.estimateInput(request, model);
    const { reservation: estimatedOutputReservation, source } =
      this.estimateOutputReservation(request, model);

    return {
      inputTokens,
      estimatedOutputReservation,
      totalEstimatedTokens: inputTokens + estimatedOutputReservation,
      source,
    };
  }
}
