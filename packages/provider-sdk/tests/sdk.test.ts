import { describe, expect, it } from "vitest";
import {
  AdapterRegistry,
  AnthropicAdapter,
  defaultAdapterRegistry,
  OpenAIAdapter,
  parseSseStream,
} from "../src/index.js";
import { GrowXProviderError } from "@growx/contracts";

describe("Provider SDK Unit Tests", () => {
  it("manages adapter registry and retrieves adapters", () => {
    const registry = new AdapterRegistry();
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("anthropic")).toBe(true);
    expect(registry.get("openai")).toBeInstanceOf(OpenAIAdapter);
    expect(registry.get("anthropic")).toBeInstanceOf(AnthropicAdapter);

    expect(() => registry.get("non-existent-provider")).toThrow(
      GrowXProviderError,
    );
  });

  it("exports defaultAdapterRegistry with built-in providers", () => {
    expect(defaultAdapterRegistry.listRegistered()).toContain("openai");
    expect(defaultAdapterRegistry.listRegistered()).toContain("anthropic");
    expect(defaultAdapterRegistry.listRegistered()).toContain("groq");
    expect(defaultAdapterRegistry.listRegistered()).toContain("mistral");
  });

  it("parses SSE streams accurately", async () => {
    const sseText =
      "event: message\ndata: Hello\n\nevent: custom\ndata: World\n\n";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseText));
        controller.close();
      },
    });

    const events: any[] = [];
    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0]).toEqual({ event: "message", data: "Hello" });
    expect(events[1]).toEqual({ event: "custom", data: "World" });
  });
});
