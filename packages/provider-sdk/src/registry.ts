import { GrowXProviderError } from "@growx/contracts";
import type { ProviderAdapter } from "./adapter.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAIAdapter } from "./adapters/openai.js";

export class AdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor() {
    // Register standard default built-in adapters
    this.register(new OpenAIAdapter("openai"));
    this.register(new AnthropicAdapter("anthropic"));
    this.register(new OpenAIAdapter("groq"));
    this.register(new OpenAIAdapter("mistral"));
    this.register(new OpenAIAdapter("xai"));
    this.register(new OpenAIAdapter("deepseek"));
    this.register(new OpenAIAdapter("together"));
    this.register(new OpenAIAdapter("fireworks"));
    this.register(new OpenAIAdapter("cerebras"));
    this.register(new OpenAIAdapter("openrouter"));
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId.toLowerCase(), adapter);
  }

  get(providerIdOrAdapterType: string): ProviderAdapter {
    const key = providerIdOrAdapterType.toLowerCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `No provider adapter registered for '${providerIdOrAdapterType}'`,
        false,
        400
      );
    }
    return adapter;
  }

  has(providerIdOrAdapterType: string): boolean {
    return this.adapters.has(providerIdOrAdapterType.toLowerCase());
  }

  listRegistered(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const defaultAdapterRegistry = new AdapterRegistry();
