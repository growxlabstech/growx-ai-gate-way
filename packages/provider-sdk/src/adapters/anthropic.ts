/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type CanonicalCapability,
  GrowXProviderError,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
  type NormalizedMessage,
  type NormalizedStreamEvent,
  type ProviderExecutionContext,
  type ProviderUsage,
  type ToolCall,
} from "@growx/contracts";
import type { ProviderAdapter, ProviderHealth } from "../adapter.js";
import { parseSseStream } from "../sse-parser.js";

export class AnthropicAdapter implements ProviderAdapter {
  constructor(public readonly providerId: string = "anthropic") {}

  validateConfiguration(config: { baseUrl: string; apiVersion?: string | null | undefined }): void {
    if (!config.baseUrl || !config.baseUrl.startsWith("http")) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Invalid Anthropic baseUrl '${config.baseUrl}'`,
        false,
        400
      );
    }
  }

  supports(capability: CanonicalCapability): boolean {
    const supported: CanonicalCapability[] = [
      "text.generate",
      "streaming",
      "tools.call",
      "vision.input",
    ];
    return supported.includes(capability);
  }

  extractUsage(raw: unknown): ProviderUsage {
    if (!raw || typeof raw !== "object") {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        source: "unavailable",
      };
    }

    const u = raw as any;
    const inputTokens = Math.max(0, Number(u.input_tokens ?? 0));
    const outputTokens = Math.max(0, Number(u.output_tokens ?? 0));
    const totalTokens = inputTokens + outputTokens;

    const cachedInputTokens =
      u.cache_read_input_tokens !== undefined
        ? Number(u.cache_read_input_tokens)
        : undefined;

    const usage: ProviderUsage = {
      inputTokens,
      outputTokens,
      totalTokens,
      source: "provider_reported",
    };
    if (cachedInputTokens !== undefined) usage.cachedInputTokens = cachedInputTokens;
    return usage;
  }

  normalizeError(error: unknown): GrowXProviderError {
    if (error instanceof GrowXProviderError) return error;

    if (error instanceof DOMException && error.name === "AbortError") {
      return new GrowXProviderError("request_cancelled", "The request was cancelled", false, 499, {
        cause: error,
      });
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return new GrowXProviderError("provider_timeout", "Provider request timed out", true, 504, {
        cause: error,
      });
    }

    const errObj = (error && typeof error === "object" ? error : {}) as any;
    const status = typeof errObj.status === "number" ? errObj.status : undefined;
    const msg =
      typeof errObj.message === "string"
        ? errObj.message
        : typeof errObj.error?.message === "string"
        ? errObj.error.message
        : "Unknown Anthropic provider error";

    if (status === 401 || status === 403) {
      return new GrowXProviderError("provider_authentication_error", "Provider authentication failed", false, 502, {
        cause: error,
      });
    }
    if (status === 404) {
      return new GrowXProviderError("model_not_found", `Model not found on provider: ${msg}`, false, 404, {
        cause: error,
      });
    }
    if (status === 429) {
      return new GrowXProviderError("provider_rate_limit", `Provider rate limit exceeded: ${msg}`, true, 429, {
        cause: error,
      });
    }
    if (status === 400) {
      return new GrowXProviderError("provider_invalid_request", `Bad request to provider: ${msg}`, false, 400, {
        cause: error,
      });
    }
    if (status === 529) {
      return new GrowXProviderError("provider_unavailable", "Anthropic is temporarily overloaded", true, 503, {
        cause: error,
      });
    }
    if (status && status >= 500) {
      return new GrowXProviderError("provider_server_error", "Provider server error occurred", true, 503, {
        cause: error,
      });
    }

    return new GrowXProviderError("provider_unavailable", `Provider error: ${msg}`, true, 503, {
      cause: error,
    });
  }

  private buildRequestBody(request: NormalizedGenerationRequest, stream = false): any {
    let systemPrompt: string | undefined = request.systemPrompt;
    const anthropicMessages: Array<{ role: "user" | "assistant"; content: string | unknown[] }> = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text;
      } else if (msg.role === "user") {
        if (typeof msg.content === "string") {
          anthropicMessages.push({ role: "user", content: msg.content });
        } else {
          // Content blocks
          const blocks = msg.content.map((part) => {
            if (part.type === "text") return { type: "text", text: part.text };
            if (part.type === "image_url") {
              return {
                type: "image",
                source: {
                  type: "url",
                  url: part.imageUrl.url,
                },
              };
            }
            return { type: "text", text: JSON.stringify(part) };
          });
          anthropicMessages.push({ role: "user", content: blocks });
        }
      } else if (msg.role === "assistant") {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const blocks: unknown[] = [];
          if (typeof msg.content === "string" && msg.content.length > 0) {
            blocks.push({ type: "text", text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            let inputObj: any = {};
            if (typeof tc.arguments === "string") {
              try {
                inputObj = JSON.parse(tc.arguments);
              } catch {
                inputObj = { raw: tc.arguments };
              }
            } else if (tc.arguments && typeof tc.arguments === "object") {
              inputObj = tc.arguments as any;
            }
            blocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: inputObj,
            });
          }
          anthropicMessages.push({ role: "assistant", content: blocks });
        } else {
          anthropicMessages.push({
            role: "assistant",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          });
        }
      } else if (msg.role === "tool") {
        // In Anthropic, tool outputs are sent as user role with tool_result blocks
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId ?? "",
              content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            },
          ],
        });
      }
    }

    const body: any = {
      model: request.providerModelId,
      messages: anthropicMessages,
      max_tokens: request.maxOutputTokens ?? 4096,
      stream,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.stop && request.stop.length > 0) body.stop_sequences = request.stop;

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        input_schema: t.parameters,
      }));

      if (request.toolChoice) {
        if (request.toolChoice === "auto") {
          body.tool_choice = { type: "auto" };
        } else if (request.toolChoice === "required") {
          body.tool_choice = { type: "any" };
        } else if (typeof request.toolChoice === "object" && request.toolChoice.type === "function") {
          body.tool_choice = { type: "tool", name: request.toolChoice.function.name };
        }
      }
    }

    return body;
  }

  private createAbortSignal(context: ProviderExecutionContext): { signal: AbortSignal; cleanup: () => void } {
    const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
    if (!context.cancellationSignal) {
      return { signal: timeoutSignal, cleanup: () => {} };
    }

    const controller = new AbortController();
    const onCancel = () => controller.abort(context.cancellationSignal?.reason);
    const onTimeout = () => controller.abort(timeoutSignal.reason);

    context.cancellationSignal.addEventListener("abort", onCancel, { once: true });
    timeoutSignal.addEventListener("abort", onTimeout, { once: true });

    return {
      signal: controller.signal,
      cleanup: () => {
        context.cancellationSignal?.removeEventListener("abort", onCancel);
        timeoutSignal.removeEventListener("abort", onTimeout);
      },
    };
  }

  async execute(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext
  ): Promise<NormalizedGenerationResponse> {
    const startedAt = new Date();
    const { signal, cleanup } = this.createAbortSignal(context);

    try {
      const rawBaseUrl = (context as unknown as any).baseUrl || "https://api.anthropic.com";
      const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");
      const url = cleanBaseUrl.endsWith("/v1")
        ? `${cleanBaseUrl}/messages`
        : `${cleanBaseUrl}/v1/messages`;

      const body = this.buildRequestBody(request, false);
      const credential = context.decryptedCredential ?? "";

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        let errJson: any | null = null;
        try {
          errJson = await res.json();
        } catch {
          // ignore
        }
        throw Object.assign(new Error(`Anthropic API error ${res.status}`), {
          status: res.status,
          error: errJson?.error ?? errJson,
          message: errJson?.error?.message ?? `Anthropic HTTP ${res.status}`,
        });
      }

      const json = (await res.json()) as any;
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();

      let textOutput = "";
      const toolCalls: ToolCall[] = [];

      if (Array.isArray(json.content)) {
        for (const block of json.content) {
          if (block.type === "text" && typeof block.text === "string") {
            textOutput += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id ?? `call_${Math.random().toString(36).slice(2)}`,
              name: block.name ?? "",
              arguments:
                typeof block.input === "string"
                  ? block.input
                  : JSON.stringify(block.input ?? {}),
            });
          }
        }
      }

      let finishReason: NormalizedGenerationResponse["finishReason"] = "stop";
      if (json.stop_reason === "end_turn") finishReason = "stop";
      else if (json.stop_reason === "max_tokens") finishReason = "length";
      else if (json.stop_reason === "tool_use") finishReason = "tool_call";
      else if (json.stop_reason === "stop_sequence") finishReason = "stop";
      else if (json.stop_reason) finishReason = "other";

      const outputMessages: NormalizedMessage[] = [
        {
          role: "assistant",
          content: textOutput,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        },
      ];

      const usage = this.extractUsage(json.usage);

      const response: NormalizedGenerationResponse = {
        requestId: request.requestId,
        canonicalModelId: request.canonicalModelId,
        providerId: this.providerId,
        providerModelId: request.providerModelId,
        output: outputMessages,
        finishReason,
        usage,
        timing: {
          startedAt,
          completedAt,
          latencyMs,
        },
      };

      if (json.id) response.providerRequestId = json.id;
      if (toolCalls.length > 0) response.toolCalls = toolCalls;

      return response;
    } catch (err) {
      throw this.normalizeError(err);
    } finally {
      cleanup();
    }
  }

  async *stream(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext
  ): AsyncIterable<NormalizedStreamEvent> {
    const startedAt = new Date();
    const { signal, cleanup } = this.createAbortSignal(context);
    let sequence = 0;
    const responseId = `resp_${request.requestId.replace(/^req_/, "")}`;

    try {
      const rawBaseUrl = (context as unknown as any).baseUrl || "https://api.anthropic.com";
      const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");
      const url = cleanBaseUrl.endsWith("/v1")
        ? `${cleanBaseUrl}/messages`
        : `${cleanBaseUrl}/v1/messages`;

      const body = this.buildRequestBody(request, true);
      const credential = context.decryptedCredential ?? "";

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        let errJson: any | null = null;
        try {
          errJson = await res.json();
        } catch {
          // ignore
        }
        throw Object.assign(new Error(`Anthropic API error ${res.status}`), {
          status: res.status,
          error: errJson?.error ?? errJson,
          message: errJson?.error?.message ?? `Anthropic HTTP ${res.status}`,
        });
      }

      if (!res.body) {
        throw new GrowXProviderError("provider_server_error", "Empty response body from Anthropic stream", true, 503);
      }

      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "response.started",
        timestamp: new Date().toISOString(),
      };

      let fullContent = "";
      const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
      let finalFinishReason: NormalizedGenerationResponse["finishReason"] = "stop";
      let inputTokens = 0;
      let outputTokens = 0;
      let firstTokenAt: Date | undefined;

      for await (const sse of parseSseStream(res.body, signal)) {
        let eventPayload: any;
        try {
          eventPayload = JSON.parse(sse.data);
        } catch {
          continue;
        }

        const eventType = sse.event || eventPayload.type;

        if (eventType === "message_start") {
          const msg = eventPayload.message;
          if (msg?.usage?.input_tokens) {
            inputTokens = Number(msg.usage.input_tokens);
          }
        } else if (eventType === "content_block_start") {
          const index = eventPayload.index ?? 0;
          const block = eventPayload.content_block;
          if (block?.type === "tool_use") {
            toolCallMap.set(index, {
              id: block.id ?? `call_${Math.random().toString(36).slice(2)}`,
              name: block.name ?? "",
              arguments: "",
            });
            yield {
              requestId: request.requestId,
              responseId,
              sequence: ++sequence,
              type: "tool_call.started",
              timestamp: new Date().toISOString(),
              toolCall: {
                id: block.id,
                name: block.name,
                index,
              },
            };
          }
        } else if (eventType === "content_block_delta") {
          const index = eventPayload.index ?? 0;
          const delta = eventPayload.delta;

          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            if (!firstTokenAt) firstTokenAt = new Date();
            fullContent += delta.text;
            yield {
              requestId: request.requestId,
              responseId,
              sequence: ++sequence,
              type: "output_text.delta",
              timestamp: new Date().toISOString(),
              delta: delta.text,
            };
          } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
            const existing = toolCallMap.get(index) ?? { id: "", name: "", arguments: "" };
            existing.arguments += delta.partial_json;
            toolCallMap.set(index, existing);

            yield {
              requestId: request.requestId,
              responseId,
              sequence: ++sequence,
              type: "tool_call.delta",
              timestamp: new Date().toISOString(),
              toolCall: {
                index,
                argumentsDelta: delta.partial_json,
              },
            };
          }
        } else if (eventType === "message_delta") {
          if (eventPayload.delta?.stop_reason) {
            const sr = eventPayload.delta.stop_reason;
            if (sr === "end_turn") finalFinishReason = "stop";
            else if (sr === "max_tokens") finalFinishReason = "length";
            else if (sr === "tool_use") finalFinishReason = "tool_call";
            else if (sr === "stop_sequence") finalFinishReason = "stop";
            else finalFinishReason = "other";
          }
          if (eventPayload.usage?.output_tokens) {
            outputTokens = Number(eventPayload.usage.output_tokens);
          }
        } else if (eventType === "error") {
          const err = eventPayload.error;
          throw Object.assign(new Error(err?.message ?? "Anthropic streaming error"), {
            status: err?.type === "rate_limit_error" ? 429 : 500,
            message: err?.message,
          });
        }
      }

      if (fullContent.length > 0) {
        yield {
          requestId: request.requestId,
          responseId,
          sequence: ++sequence,
          type: "output_text.done",
          timestamp: new Date().toISOString(),
        };
      }

      if (toolCallMap.size > 0) {
        yield {
          requestId: request.requestId,
          responseId,
          sequence: ++sequence,
          type: "tool_call.done",
          timestamp: new Date().toISOString(),
        };
      }

      const finalUsage: ProviderUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        source: "provider_reported",
      };

      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "usage",
        timestamp: new Date().toISOString(),
        usage: finalUsage,
      };

      const completedAt = new Date();
      const finalToolCalls: ToolCall[] = Array.from(toolCallMap.values()).map((tc) => ({
        id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
        name: tc.name,
        arguments: tc.arguments,
      }));

      const timing: { startedAt: Date; completedAt: Date; latencyMs: number; timeToFirstTokenMs?: number } = {
        startedAt,
        completedAt,
        latencyMs: completedAt.getTime() - startedAt.getTime(),
      };
      if (firstTokenAt) {
        timing.timeToFirstTokenMs = firstTokenAt.getTime() - startedAt.getTime();
      }

      const completeResponse: NormalizedGenerationResponse = {
        requestId: request.requestId,
        canonicalModelId: request.canonicalModelId,
        providerId: this.providerId,
        providerModelId: request.providerModelId,
        output: [
          {
            role: "assistant",
            content: fullContent,
            ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
          },
        ],
        finishReason: finalFinishReason,
        usage: finalUsage,
        timing,
      };
      if (finalToolCalls.length > 0) completeResponse.toolCalls = finalToolCalls;

      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "response.completed",
        timestamp: new Date().toISOString(),
        finishReason: finalFinishReason,
        response: completeResponse,
        usage: finalUsage,
      };
    } catch (err) {
      const normalized = this.normalizeError(err);
      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "error",
        timestamp: new Date().toISOString(),
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
        },
      };
      throw normalized;
    } finally {
      cleanup();
    }
  }

  async healthProbe(context: {
    baseUrl: string;
    credential?: string | undefined;
    cancellationSignal?: AbortSignal | undefined;
    timeoutMs: number;
  }): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const signal = context.cancellationSignal
        ? AbortSignal.any([context.cancellationSignal, AbortSignal.timeout(context.timeoutMs)])
        : AbortSignal.timeout(context.timeoutMs);

      const rawBaseUrl = context.baseUrl || "https://api.anthropic.com";
      const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");
      const url = cleanBaseUrl.endsWith("/v1")
        ? `${cleanBaseUrl}/models`
        : `${cleanBaseUrl}/v1/models`;

      const res = await fetch(url, {
        headers: context.credential
          ? {
              "x-api-key": context.credential,
              "anthropic-version": "2023-06-01",
            }
          : {},
        signal,
      });

      return {
        state: res.ok ? "healthy" : "degraded",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        state: "unhealthy",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        detail: err instanceof Error ? err.message : "Health probe failed",
      };
    }
  }

  async health(options: {
    baseUrl: string;
    credential?: string | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<ProviderHealth> {
    return this.healthProbe({
      baseUrl: options.baseUrl,
      credential: options.credential,
      cancellationSignal: options.signal,
      timeoutMs: 5000,
    });
  }
}
