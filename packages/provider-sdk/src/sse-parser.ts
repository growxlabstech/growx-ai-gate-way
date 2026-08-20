/**
 * Asynchronously parses a fetch Response body stream into Server-Sent Events (data payloads).
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<{ event?: string | undefined; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      let currentEvent: string | undefined;
      let currentData: string[] = [];

      for (const line of lines) {
        if (line.startsWith(":")) {
          // Comment line, ignore
          continue;
        } else if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim());
        } else if (line.trim() === "") {
          // Empty line indicates event dispatch
          if (currentData.length > 0) {
            const dataStr = currentData.join("\n");
            yield { event: currentEvent, data: dataStr };
            currentEvent = undefined;
            currentData = [];
          }
        }
      }

      if (currentData.length > 0) {
        const dataStr = currentData.join("\n");
        yield { event: currentEvent, data: dataStr };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
