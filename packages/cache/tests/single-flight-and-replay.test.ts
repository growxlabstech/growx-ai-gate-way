import { describe, expect, it } from "vitest";
import {
  SingleFlightGroup,
  replayCachedResponseAsStream,
} from "../src/index.js";
import type { OpenAIChatCompletionResponse } from "@growx/contracts";

describe("Single-Flight Stampede Coalescing & Streaming Replay", () => {
  it("coalesces 50 concurrent identical requests into 1 single factory invocation", async () => {
    const singleFlight = new SingleFlightGroup<string>();
    let factoryExecutions = 0;

    const factory = async () => {
      factoryExecutions++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "cached-value";
    };

    const promises = Array.from({ length: 50 }, () =>
      singleFlight.run("cache_key_shared", 5000, factory),
    );

    const results = await Promise.all(promises);
    expect(factoryExecutions).toBe(1);
    expect(results).toHaveLength(50);
    expect(results.filter((r) => r.deduplicated).length).toBe(49);
    expect(results.every((r) => r.value === "cached-value")).toBe(true);
  });

  it("replays cached response into standard OpenAI streaming chunks", async () => {
    const cachedResponse: OpenAIChatCompletionResponse = {
      id: "chatcmpl_cached_123",
      object: "chat.completion",
      created: 1720000000,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello streaming world!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    };

    const chunks: any[] = [];
    for await (const chunk of replayCachedResponseAsStream(
      cachedResponse,
      "req_new_456",
    )) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Chunk 1: Role chunk
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    expect(chunks[0].choices[0].finish_reason).toBeNull();

    // Chunk 2: Content chunk
    expect(chunks[1].choices[0].delta.content).toBe("Hello streaming world!");

    // Chunk 3: Terminal chunk
    expect(chunks[2].choices[0].finish_reason).toBe("stop");
    expect(chunks[2].usage?.total_tokens).toBe(9);
  });
});
