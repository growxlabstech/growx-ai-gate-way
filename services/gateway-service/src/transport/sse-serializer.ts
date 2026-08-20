/**
 * SSE Serializer — Isolated, side-effect-free serialization of Server-Sent Events
 * for the GrowX AI Gateway streaming transport.
 *
 * All functions produce raw SSE text ready to be written to an HTTP response.
 * No I/O, no state, no side effects.
 */

import type { OpenAIChatCompletionChunk } from "@growx/contracts";

/**
 * Serialize an OpenAI-compatible chat completion chunk as an SSE data frame.
 * Format: `data: {json}\n\n`
 */
export function serializeChunk(chunk: OpenAIChatCompletionChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Serialize the SSE stream termination marker.
 * Format: `data: [DONE]\n\n`
 */
export function serializeDone(): string {
  return "data: [DONE]\n\n";
}

/**
 * Serialize an SSE heartbeat comment to keep connections alive across proxies.
 * Format: `: ping\n\n`
 *
 * Per SSE spec, lines starting with `:` are comments ignored by EventSource clients
 * but keep the TCP connection alive.
 */
export function serializeHeartbeat(): string {
  return ": ping\n\n";
}

/**
 * Serialize a safe terminal error event for mid-stream errors.
 *
 * This is used when SSE headers have already been sent and we cannot
 * switch to JSON error format. The error is delivered as a final SSE
 * data event before the stream closes.
 *
 * Format:
 * ```
 * data: {"error":{"type":"api_error","code":"...","message":"...","requestId":"..."}}\n\n
 * data: [DONE]\n\n
 * ```
 */
export function serializeStreamError(
  code: string,
  message: string,
  requestId: string
): string {
  const errorPayload = {
    error: {
      type: "api_error" as const,
      code,
      message,
      requestId,
    },
  };
  return `data: ${JSON.stringify(errorPayload)}\n\ndata: [DONE]\n\n`;
}
