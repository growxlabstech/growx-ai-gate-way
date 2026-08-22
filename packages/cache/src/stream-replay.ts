import type {
  NormalizedStreamEvent,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";

export async function* replayCachedResponseAsNormalizedEvents(
  cachedResponse: OpenAIChatCompletionResponse,
  requestId: string,
): AsyncIterable<NormalizedStreamEvent> {
  const choice = cachedResponse.choices[0];
  const rawContent = choice?.message.content;
  const content: string =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as any[])
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")
        : "";
  const now = new Date().toISOString();
  const responseId = createPublicId("req");

  // 1. Response started
  yield {
    requestId,
    responseId,
    sequence: 1,
    type: "response.started",
    timestamp: now,
  };

  // 2. Output text delta
  if (content.length > 0) {
    yield {
      requestId,
      responseId,
      sequence: 2,
      type: "output_text.delta",
      timestamp: now,
      delta: content,
    };
  }

  // 3. Output text done
  yield {
    requestId,
    responseId,
    sequence: 3,
    type: "output_text.done",
    timestamp: now,
    finishReason: "stop",
  };

  // 4. Usage event
  const usage = cachedResponse.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  yield {
    requestId,
    responseId,
    sequence: 4,
    type: "usage",
    timestamp: now,
    usage: {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      source: "provider_reported",
    },
  };

  // 5. Response completed
  yield {
    requestId,
    responseId,
    sequence: 5,
    type: "response.completed",
    timestamp: now,
    finishReason: "stop",
  };
}

export async function* replayCachedResponseAsStream(
  cachedResponse: OpenAIChatCompletionResponse,
  requestId: string,
  createdTimestamp?: number,
): AsyncIterable<OpenAIChatCompletionChunk> {
  const choice = cachedResponse.choices[0];
  const rawContent = choice?.message.content;
  const content: string =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? (rawContent as any[])
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")
        : "";
  const created = createdTimestamp ?? Math.floor(Date.now() / 1000);
  const streamId = `chatcmpl-${createPublicId("req").slice(4)}`;

  // 1. Initial role chunk
  yield {
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: cachedResponse.model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null,
      },
    ],
  };

  // 2. Content delta chunk
  if (content.length > 0) {
    yield {
      id: streamId,
      object: "chat.completion.chunk",
      created,
      model: cachedResponse.model,
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    };
  }

  // 3. Final terminal chunk with finish_reason & usage
  yield {
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: cachedResponse.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: (choice?.finish_reason as any) ?? "stop",
      },
    ],
    usage: cachedResponse.usage,
  };
}
