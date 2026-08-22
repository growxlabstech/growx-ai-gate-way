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

export class OpenAIAdapter implements ProviderAdapter {
  constructor(public readonly providerId: string = "openai") {}

  validateConfiguration(config: {
    baseUrl: string;
    apiVersion?: string | null | undefined;
  }): void {
    if (!config.baseUrl || !config.baseUrl.startsWith("http")) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Invalid OpenAI baseUrl '${config.baseUrl}'`,
        false,
        400,
      );
    }
  }

  supports(capability: CanonicalCapability): boolean {
    const supported: CanonicalCapability[] = [
      "text.generate",
      "streaming",
      "tools.call",
      "structured_output",
      "vision.input",
      "text.reason",
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
    const inputTokens = Math.max(
      0,
      Number(u.prompt_tokens ?? u.input_tokens ?? 0),
    );
    const outputTokens = Math.max(
      0,
      Number(u.completion_tokens ?? u.output_tokens ?? 0),
    );
    const totalTokens = Math.max(
      inputTokens + outputTokens,
      Number(u.total_tokens ?? inputTokens + outputTokens),
    );

    const cachedInputTokens =
      u.prompt_tokens_details?.cached_tokens !== undefined
        ? Number(u.prompt_tokens_details.cached_tokens)
        : u.cached_tokens !== undefined
          ? Number(u.cached_tokens)
          : undefined;

    const reasoningTokens =
      u.completion_tokens_details?.reasoning_tokens !== undefined
        ? Number(u.completion_tokens_details.reasoning_tokens)
        : undefined;

    const usage: ProviderUsage = {
      inputTokens,
      outputTokens,
      totalTokens,
      source: "provider_reported",
    };
    if (cachedInputTokens !== undefined)
      usage.cachedInputTokens = cachedInputTokens;
    if (reasoningTokens !== undefined) usage.reasoningTokens = reasoningTokens;
    return usage;
  }

  normalizeError(error: unknown): GrowXProviderError {
    if (error instanceof GrowXProviderError) return error;

    if (error instanceof DOMException && error.name === "AbortError") {
      return new GrowXProviderError(
        "request_cancelled",
        "The request was cancelled",
        false,
        499,
        {
          cause: error,
        },
      );
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return new GrowXProviderError(
        "provider_timeout",
        "Provider request timed out",
        true,
        504,
        {
          cause: error,
        },
      );
    }

    const errObj = (error && typeof error === "object" ? error : {}) as any;
    const status =
      typeof errObj.status === "number" ? errObj.status : undefined;
    const msg =
      typeof errObj.message === "string"
        ? errObj.message
        : typeof errObj.error?.message === "string"
          ? errObj.error.message
          : "Unknown OpenAI provider error";

    if (status === 401 || status === 403) {
      return new GrowXProviderError(
        "provider_authentication_error",
        "Provider authentication failed",
        false,
        502,
        {
          cause: error,
        },
      );
    }
    if (status === 404) {
      return new GrowXProviderError(
        "model_not_found",
        `Model not found on provider: ${msg}`,
        false,
        404,
        {
          cause: error,
        },
      );
    }
    if (status === 429) {
      return new GrowXProviderError(
        "provider_rate_limit",
        `Provider rate limit exceeded: ${msg}`,
        true,
        429,
        {
          cause: error,
        },
      );
    }
    if (status === 400) {
      return new GrowXProviderError(
        "provider_invalid_request",
        `Bad request to provider: ${msg}`,
        false,
        400,
        {
          cause: error,
        },
      );
    }
    if (status && status >= 500) {
      return new GrowXProviderError(
        "provider_server_error",
        "Provider server error occurred",
        true,
        503,
        {
          cause: error,
        },
      );
    }

    return new GrowXProviderError(
      "provider_unavailable",
      `Provider error: ${msg}`,
      true,
      503,
      {
        cause: error,
      },
    );
  }

  private buildRequestBody(
    request: NormalizedGenerationRequest,
    stream = false,
  ): any {
    const openAIMessages: Array<any> = [];

    // If systemPrompt is provided separately and no top-level system message is present
    if (
      request.systemPrompt &&
      !request.messages.some((m) => m.role === "system")
    ) {
      openAIMessages.push({
        role: "system",
        content: request.systemPrompt,
      });
    }

    for (const msg of request.messages) {
      if (msg.role === "system") {
        openAIMessages.push({
          role: "system",
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        });
      } else if (msg.role === "user") {
        if (typeof msg.content === "string") {
          openAIMessages.push({
            role: "user",
            content: msg.content,
            ...(msg.name ? { name: msg.name } : {}),
          });
        } else {
          // Multimodal parts
          const parts = msg.content.map((part) => {
            if (part.type === "text") return { type: "text", text: part.text };
            if (part.type === "image_url") {
              return {
                type: "image_url",
                image_url: {
                  url: part.imageUrl.url,
                  ...(part.imageUrl.detail
                    ? { detail: part.imageUrl.detail }
                    : {}),
                },
              };
            }
            return { type: "text", text: JSON.stringify(part) };
          });
          openAIMessages.push({
            role: "user",
            content: parts,
            ...(msg.name ? { name: msg.name } : {}),
          });
        }
      } else if (msg.role === "assistant") {
        const item: any = {
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : null,
        };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          item.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments:
                typeof tc.arguments === "string"
                  ? tc.arguments
                  : JSON.stringify(tc.arguments),
            },
          }));
        }
        openAIMessages.push(item);
      } else if (msg.role === "tool") {
        openAIMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId ?? "",
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        });
      }
    }

    const body: any = {
      model: request.providerModelId,
      messages: openAIMessages,
      stream,
    };

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    if (request.temperature !== undefined)
      body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.maxOutputTokens !== undefined)
      body.max_tokens = request.maxOutputTokens;
    if (request.stop && request.stop.length > 0) body.stop = request.stop;

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          ...(t.description ? { description: t.description } : {}),
          parameters: t.parameters,
        },
      }));

      if (request.toolChoice) {
        body.tool_choice = request.toolChoice;
      }
    }

    // Structured Output
    if (request.structuredOutput) {
      if (request.structuredOutput.type === "json_object") {
        body.response_format = { type: "json_object" };
      } else if (
        request.structuredOutput.type === "json_schema" &&
        request.structuredOutput.schema
      ) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: request.structuredOutput.name ?? "response",
            schema: request.structuredOutput.schema,
            strict: request.structuredOutput.strict ?? true,
          },
        };
      }
    }

    // Reasoning
    if (request.reasoning?.effort) {
      body.reasoning_effort = request.reasoning.effort;
    }

    return body;
  }

  private createAbortSignal(context: ProviderExecutionContext): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const timeoutSignal = AbortSignal.timeout(context.timeoutMs);
    if (!context.cancellationSignal) {
      return { signal: timeoutSignal, cleanup: () => {} };
    }

    const controller = new AbortController();
    const onCancel = () => controller.abort(context.cancellationSignal?.reason);
    const onTimeout = () => controller.abort(timeoutSignal.reason);

    context.cancellationSignal.addEventListener("abort", onCancel, {
      once: true,
    });
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
    context: ProviderExecutionContext,
  ): Promise<NormalizedGenerationResponse> {
    const startedAt = new Date();
    const { signal, cleanup } = this.createAbortSignal(context);

    try {
      const baseUrl =
        ((context as unknown as any).baseUrl as string | undefined) ||
        "https://api.openai.com/v1";
      const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const body = this.buildRequestBody(request, false);

      const credential = context.decryptedCredential ?? "";
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${credential}`,
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
        throw Object.assign(new Error(`OpenAI API error ${res.status}`), {
          status: res.status,
          error: errJson?.error ?? errJson,
          message: errJson?.error?.message ?? `OpenAI HTTP ${res.status}`,
        });
      }

      const json = (await res.json()) as any;
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();

      const choice = json.choices?.[0];
      const message = choice?.message ?? {};
      const outputText = message.content ?? "";

      const toolCalls: ToolCall[] = [];
      if (Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          toolCalls.push({
            id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
            name:
              (tc as any & { function?: { name?: string; arguments?: string } })
                .function?.name ?? "",
            arguments:
              (tc as any & { function?: { name?: string; arguments?: string } })
                .function?.arguments ?? "{}",
          });
        }
      }

      let finishReason: NormalizedGenerationResponse["finishReason"] = "stop";
      if (choice?.finish_reason === "length") finishReason = "length";
      else if (choice?.finish_reason === "tool_calls")
        finishReason = "tool_call";
      else if (choice?.finish_reason === "content_filter")
        finishReason = "content_filter";
      else if (choice?.finish_reason === "stop") finishReason = "stop";
      else if (choice?.finish_reason) finishReason = "other";

      const outputMessages: NormalizedMessage[] = [
        {
          role: "assistant",
          content: outputText,
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
    context: ProviderExecutionContext,
  ): AsyncIterable<NormalizedStreamEvent> {
    const startedAt = new Date();
    const { signal, cleanup } = this.createAbortSignal(context);
    let sequence = 0;
    const responseId = `resp_${request.requestId.replace(/^req_/, "")}`;

    try {
      const baseUrl =
        (context as unknown as any).baseUrl || "https://api.openai.com/v1";
      const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const body = this.buildRequestBody(request, true);

      const credential = context.decryptedCredential ?? "";
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${credential}`,
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
        throw Object.assign(new Error(`OpenAI API error ${res.status}`), {
          status: res.status,
          error: errJson?.error ?? errJson,
          message: errJson?.error?.message ?? `OpenAI HTTP ${res.status}`,
        });
      }

      if (!res.body) {
        throw new GrowXProviderError(
          "provider_server_error",
          "Empty response body from OpenAI stream",
          true,
          503,
        );
      }

      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "response.started",
        timestamp: new Date().toISOString(),
      };

      let fullContent = "";
      const toolCallMap = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();
      let finalFinishReason: NormalizedGenerationResponse["finishReason"] =
        "stop";
      let finalUsage: ProviderUsage | undefined;
      let firstTokenAt: Date | undefined;

      for await (const sse of parseSseStream(res.body, signal)) {
        if (sse.data === "[DONE]") break;

        let chunk: any;
        try {
          chunk = JSON.parse(sse.data);
        } catch {
          continue;
        }

        if (chunk.usage) {
          finalUsage = this.extractUsage(chunk.usage);
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          if (choice.finish_reason === "length") finalFinishReason = "length";
          else if (choice.finish_reason === "tool_calls")
            finalFinishReason = "tool_call";
          else if (choice.finish_reason === "content_filter")
            finalFinishReason = "content_filter";
          else if (choice.finish_reason === "stop") finalFinishReason = "stop";
          else finalFinishReason = "other";
        }

        const delta = choice.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          if (!firstTokenAt) firstTokenAt = new Date();
          fullContent += delta.content;
          yield {
            requestId: request.requestId,
            responseId,
            sequence: ++sequence,
            type: "output_text.delta",
            timestamp: new Date().toISOString(),
            delta: delta.content,
          };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            const existing = toolCallMap.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments)
              existing.arguments += tc.function.arguments;
            toolCallMap.set(index, existing);

            yield {
              requestId: request.requestId,
              responseId,
              sequence: ++sequence,
              type: "tool_call.delta",
              timestamp: new Date().toISOString(),
              toolCall: {
                id: tc.id,
                name: tc.function?.name,
                index,
                argumentsDelta: tc.function?.arguments,
              },
            };
          }
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

      if (finalUsage) {
        yield {
          requestId: request.requestId,
          responseId,
          sequence: ++sequence,
          type: "usage",
          timestamp: new Date().toISOString(),
          usage: finalUsage,
        };
      }

      const completedAt = new Date();
      const finalToolCalls: ToolCall[] = Array.from(toolCallMap.values()).map(
        (tc) => ({
          id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
          name: tc.name,
          arguments: tc.arguments,
        }),
      );

      const timing: {
        startedAt: Date;
        completedAt: Date;
        latencyMs: number;
        timeToFirstTokenMs?: number;
      } = {
        startedAt,
        completedAt,
        latencyMs: completedAt.getTime() - startedAt.getTime(),
      };
      if (firstTokenAt) {
        timing.timeToFirstTokenMs =
          firstTokenAt.getTime() - startedAt.getTime();
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
        usage: finalUsage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          source: "unavailable",
        },
        timing,
      };
      if (finalToolCalls.length > 0)
        completeResponse.toolCalls = finalToolCalls;

      yield {
        requestId: request.requestId,
        responseId,
        sequence: ++sequence,
        type: "response.completed",
        timestamp: new Date().toISOString(),
        finishReason: finalFinishReason,
        response: completeResponse,
        ...(finalUsage ? { usage: finalUsage } : {}),
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
        ? AbortSignal.any([
            context.cancellationSignal,
            AbortSignal.timeout(context.timeoutMs),
          ])
        : AbortSignal.timeout(context.timeoutMs);

      const res = await fetch(`${context.baseUrl.replace(/\/+$/, "")}/models`, {
        headers: context.credential
          ? { authorization: `Bearer ${context.credential}` }
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
