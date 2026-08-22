import type { StreamEventLog, ToolCallItem } from "./playground-types";

export interface StreamParserCallbacks {
  onStart: (requestId: string | null) => void;
  onDelta: (content: string, ttftMs: number | null) => void;
  onToolCallDelta: (toolCalls: ToolCallItem[]) => void;
  onUsage: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
  }) => void;
  onEvent: (event: StreamEventLog) => void;
  onError: (error: { message: string; code?: string; type?: string }) => void;
  onDone: (fullOutput: string, rawResponse: any) => void;
}

export async function parseSseStream(
  response: Response,
  callbacks: StreamParserCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const requestId =
    response.headers.get("x-request-id") ?? response.headers.get("request-id");
  callbacks.onStart(requestId);

  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let accumulatedText = "";
  const accumulatedToolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();
  let latestRawResponse: any = null;
  let isDone = false;

  if (!response.body) {
    callbacks.onError({
      message: "No response body received from server",
      code: "empty_response",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // Heartbeat or comment

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();

          if (dataStr === "[DONE]") {
            callbacks.onEvent({
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              timestamp: Date.now() - startTime,
              type: "done",
              summary: "[DONE] Stream Terminated",
              raw: { done: true },
            });
            callbacks.onDone(
              accumulatedText,
              latestRawResponse ?? { output: accumulatedText },
            );
            isDone = true;
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            latestRawResponse = parsed;

            // Handle stream-level error payload
            if (parsed.error) {
              callbacks.onError({
                message: parsed.error.message ?? "Streaming error occurred",
                code: parsed.error.code ?? "stream_error",
                type: parsed.error.type ?? "provider_error",
              });
              callbacks.onEvent({
                id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                timestamp: Date.now() - startTime,
                type: "error",
                summary: `Error: ${parsed.error.message}`,
                raw: parsed,
              });
              return;
            }

            // Handle Choice Deltas
            const choice = parsed.choices?.[0];
            if (choice) {
              const delta = choice.delta;
              if (delta) {
                // Text delta
                if (
                  typeof delta.content === "string" &&
                  delta.content.length > 0
                ) {
                  if (firstTokenTime === null) {
                    firstTokenTime = Date.now() - startTime;
                  }
                  accumulatedText += delta.content;
                  callbacks.onDelta(delta.content, firstTokenTime);

                  callbacks.onEvent({
                    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    timestamp: Date.now() - startTime,
                    type: "delta",
                    summary: `Text: "${delta.content.replace(/\n/g, "\\n").slice(0, 30)}${delta.content.length > 30 ? "…" : ""}"`,
                    raw: parsed,
                  });
                }

                // Tool Calls delta
                if (
                  Array.isArray(delta.tool_calls) &&
                  delta.tool_calls.length > 0
                ) {
                  if (firstTokenTime === null) {
                    firstTokenTime = Date.now() - startTime;
                  }
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    const existing = accumulatedToolCalls.get(idx) ?? {
                      id: tc.id ?? `call_${idx}`,
                      name: "",
                      arguments: "",
                    };
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name += tc.function.name;
                    if (tc.function?.arguments)
                      existing.arguments += tc.function.arguments;
                    accumulatedToolCalls.set(idx, existing);
                  }

                  const toolCallItems: ToolCallItem[] = Array.from(
                    accumulatedToolCalls.values(),
                  ).map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: {
                      name: tc.name,
                      arguments: tc.arguments,
                    },
                  }));

                  callbacks.onToolCallDelta(toolCallItems);

                  callbacks.onEvent({
                    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    timestamp: Date.now() - startTime,
                    type: "tool_call",
                    summary: `Tool Call: ${toolCallItems.map((t) => t.function.name || t.id).join(", ")}`,
                    raw: parsed,
                  });
                }
              }
            }

            // Handle final usage chunk
            if (parsed.usage) {
              callbacks.onUsage({
                inputTokens:
                  parsed.usage.prompt_tokens ?? parsed.usage.input_tokens,
                outputTokens:
                  parsed.usage.completion_tokens ?? parsed.usage.output_tokens,
                totalTokens: parsed.usage.total_tokens,
                cost: parsed.usage.cost ?? parsed.cost,
              });

              callbacks.onEvent({
                id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                timestamp: Date.now() - startTime,
                type: "usage",
                summary: `Usage: ${parsed.usage.total_tokens ?? 0} tokens`,
                raw: parsed,
              });
            }
          } catch (jsonErr) {
            // Non-JSON SSE event data frame
          }
        }
      }
    }

    // Flush any remaining decoder buffer
    const finalRemnant = decoder.decode();
    if (finalRemnant && finalRemnant.startsWith("data:")) {
      const dataStr = finalRemnant.slice(5).trim();
      if (dataStr && dataStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(dataStr);
          latestRawResponse = parsed;
          if (parsed.choices?.[0]?.delta?.content) {
            accumulatedText += parsed.choices[0].delta.content;
            callbacks.onDelta(parsed.choices[0].delta.content, firstTokenTime);
          }
        } catch {
          // ignore
        }
      }
    }

    if (!isDone) {
      callbacks.onDone(
        accumulatedText,
        latestRawResponse ?? { output: accumulatedText },
      );
    }
  } catch (readErr: any) {
    if (signal?.aborted) {
      return; // cancellation
    }
    callbacks.onError({
      message: readErr?.message ?? "Error reading stream from server",
      code: "stream_read_error",
    });
  }
}
