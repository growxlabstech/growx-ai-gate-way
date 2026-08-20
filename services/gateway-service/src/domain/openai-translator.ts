import type {
  CanonicalCapability,
  FinishReason,
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  NormalizedMessage,
  NormalizedStreamEvent,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIChatMessage,
  StructuredOutputRequest,
  ToolCall,
} from "@growx/contracts";

export function deriveRequiredCapabilities(
  request: OpenAIChatCompletionRequest
): CanonicalCapability[] {
  const capabilities: CanonicalCapability[] = ["text.generate"];

  if (request.stream) {
    capabilities.push("streaming");
  }

  if (request.tools && request.tools.length > 0) {
    capabilities.push("tools.call");
  }

  if (
    request.response_format &&
    (request.response_format.type === "json_object" ||
      request.response_format.type === "json_schema")
  ) {
    capabilities.push("structured_output");
  }

  if (request.reasoning_effort) {
    capabilities.push("text.reason");
  }

  // Check if any message contains image, audio, or file parts
  let hasImages = false;
  let hasAudio = false;

  for (const msg of request.messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image_url") hasImages = true;
        if (part.type === "audio") hasAudio = true;
        if (part.type === "file") {
          const mime = (part as any).file?.mimeType?.toLowerCase() || "";
          if (mime.startsWith("image/")) hasImages = true;
          if (mime.startsWith("audio/")) hasAudio = true;
        }
      }
    }
  }

  if (hasImages) {
    capabilities.push("vision.input");
  }
  if (hasAudio) {
    capabilities.push("audio.input");
  }

  return capabilities;
}

export function translateOpenAIMessages(
  messages: readonly OpenAIChatMessage[]
): NormalizedMessage[] {
  return messages.map((msg) => {
    const normalized: NormalizedMessage = {
      role: msg.role,
      content: msg.content ?? "",
    };

    if (msg.name) {
      normalized.name = msg.name;
    }

    if (msg.tool_call_id) {
      normalized.toolCallId = msg.tool_call_id;
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      normalized.toolCalls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    return normalized;
  });
}

export function toNormalizedGenerationRequest(
  request: OpenAIChatCompletionRequest,
  requestId: string,
  canonicalModelId: string,
  providerModelId: string,
  timeoutMs = 60_000
): NormalizedGenerationRequest {
  const normalizedMessages = translateOpenAIMessages(request.messages);

  let structuredOutput: StructuredOutputRequest | undefined;
  if (request.response_format) {
    if (request.response_format.type === "json_object") {
      structuredOutput = {
        type: "json_object",
      };
    } else if (request.response_format.type === "json_schema") {
      structuredOutput = {
        type: "json_schema",
        name: request.response_format.json_schema?.name,
        schema: request.response_format.json_schema?.schema,
        strict: request.response_format.json_schema?.strict,
      };
    }
  }

  const stop = request.stop
    ? Array.isArray(request.stop)
      ? request.stop
      : [request.stop]
    : undefined;

  const maxOutputTokens = request.max_completion_tokens ?? request.max_tokens;

  return {
    requestId,
    canonicalModelId,
    providerModelId,
    messages: normalizedMessages,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.top_p !== undefined ? { topP: request.top_p } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(stop ? { stop } : {}),
    ...(request.stream !== undefined ? { stream: request.stream } : {}),
    ...(request.tools ? { tools: request.tools } : {}),
    ...(request.tool_choice ? { toolChoice: request.tool_choice as any } : {}),
    ...(structuredOutput ? { structuredOutput } : {}),
    ...(request.reasoning_effort ? { reasoning: { effort: request.reasoning_effort } } : {}),
    ...(request.user ? { metadata: { user: request.user } } : {}),
    timeoutMs,
  };
}

export function mapToOpenAIFinishReason(
  reason: FinishReason
): "stop" | "length" | "tool_calls" | "content_filter" | null {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_call":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    case "error":
    case "cancelled":
    case "other":
    default:
      return null;
  }
}

export function toOpenAIChatCompletionResponse(
  response: NormalizedGenerationResponse,
  requestedModel: string
): OpenAIChatCompletionResponse {
  const firstOutput = response.output[0];
  const content =
    typeof firstOutput?.content === "string"
      ? firstOutput.content
      : firstOutput?.content
      ? JSON.stringify(firstOutput.content)
      : null;

  const toolCalls = response.toolCalls?.map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments:
        typeof tc.arguments === "string"
          ? tc.arguments
          : JSON.stringify(tc.arguments),
    },
  }));

  const finishReason = mapToOpenAIFinishReason(response.finishReason);

  const message: OpenAIChatMessage = {
    role: "assistant",
    content,
    ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  const choice = {
    index: 0,
    message,
    finish_reason: finishReason,
  };

  const created = Math.floor(
    (response.timing.startedAt instanceof Date
      ? response.timing.startedAt.getTime()
      : Date.now()) / 1000
  );

  return {
    id: `chatcmpl_${response.requestId.replace(/^req_/, "")}`,
    object: "chat.completion",
    created,
    model: requestedModel,
    choices: [choice],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.totalTokens,
      ...(response.usage.cachedInputTokens !== undefined
        ? { prompt_tokens_details: { cached_tokens: response.usage.cachedInputTokens } }
        : {}),
      ...(response.usage.reasoningTokens !== undefined
        ? { completion_tokens_details: { reasoning_tokens: response.usage.reasoningTokens } }
        : {}),
    },
    system_fingerprint: `fp_growx_${response.providerId}`,
  };
}

export function toOpenAIChatCompletionChunk(
  event: NormalizedStreamEvent,
  requestedModel: string,
  created: number
): OpenAIChatCompletionChunk {
  const choice: {
    index: number;
    delta: {
      role?: "system" | "user" | "assistant" | "tool" | undefined;
      content?: string | null | undefined;
      tool_calls?: Array<{
        index: number;
        id?: string | undefined;
        type?: "function" | undefined;
        function?: { name?: string | undefined; arguments?: string | undefined } | undefined;
      }> | undefined;
    };
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null | undefined;
  } = {
    index: 0,
    delta: {},
  };

  if (event.type === "response.started") {
    choice.delta = { role: "assistant" };
  } else if (event.type === "output_text.delta" && event.delta) {
    choice.delta = { content: event.delta };
  } else if (event.type === "tool_call.started" || event.type === "tool_call.delta") {
    if (event.toolCall) {
      choice.delta = {
        tool_calls: [
          {
            index: event.toolCall.index ?? 0,
            ...(event.toolCall.id ? { id: event.toolCall.id } : {}),
            type: "function",
            function: {
              ...(event.toolCall.name ? { name: event.toolCall.name } : {}),
              ...(event.toolCall.argumentsDelta
                ? { arguments: event.toolCall.argumentsDelta }
                : {}),
            },
          },
        ],
      };
    }
  } else if (event.type === "response.completed") {
    if (event.finishReason) {
      choice.finish_reason = mapToOpenAIFinishReason(event.finishReason);
    }
  }

  const usageSource = event.usage ?? (event as any).response?.usage;

  return {
    id: `chatcmpl_${event.requestId ? event.requestId.replace(/^req_/, "") : "stream"}`,
    object: "chat.completion.chunk",
    created,
    model: requestedModel,
    choices: [choice],
    ...(usageSource
      ? {
          usage: {
            prompt_tokens: usageSource.inputTokens,
            completion_tokens: usageSource.outputTokens,
            total_tokens: usageSource.totalTokens,
            ...(usageSource.cachedInputTokens !== undefined
              ? { prompt_tokens_details: { cached_tokens: usageSource.cachedInputTokens } }
              : {}),
            ...(usageSource.reasoningTokens !== undefined
              ? {
                  completion_tokens_details: {
                    reasoning_tokens: usageSource.reasoningTokens,
                  },
                }
              : {}),
          },
        }
      : {}),
    system_fingerprint: "fp_growx",
  };
}
