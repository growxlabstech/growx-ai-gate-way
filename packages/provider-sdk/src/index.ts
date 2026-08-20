import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import type { ProviderAdapter } from "./adapter.js";

export * from "./adapter.js";
export * from "./sse-parser.js";
export * from "./adapters/openai.js";
export * from "./adapters/anthropic.js";
export * from "./registry.js";

// Backward-compatibility aliases
export type AIProviderAdapter = ProviderAdapter;
export { OpenAIAdapter as OpenAICompatibleAdapter };

export class GeminiAdapter extends OpenAIAdapter {
  constructor() {
    super("google");
  }
}

export const adapters = {
  openai: new OpenAIAdapter("openai"),
  anthropic: new AnthropicAdapter("anthropic"),
  google: new GeminiAdapter(),
  groq: new OpenAIAdapter("groq"),
  mistral: new OpenAIAdapter("mistral"),
  xai: new OpenAIAdapter("xai"),
  openrouter: new OpenAIAdapter("openrouter"),
} as const;
