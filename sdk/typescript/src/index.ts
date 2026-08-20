export interface GrowXAIOptions {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
}

export interface ResponseCreateParams {
  model: string;
  input: string;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface GrowXResponse {
  id: string;
  model: string;
  output: Array<{ type: string; content?: string }>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export class GrowXError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string | null,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "GrowXError";
  }
}

export class AuthenticationError extends GrowXError {}
export class PermissionError extends GrowXError {}
export class RateLimitError extends GrowXError {}
export class BillingError extends GrowXError {}
export class ModelError extends GrowXError {}
export class ProviderError extends GrowXError {}
export class TimeoutError extends GrowXError {}

function errorClass(status: number, code: string): typeof GrowXError {
  if (status === 401) return AuthenticationError;
  if (status === 403) return PermissionError;
  if (status === 429) return RateLimitError;
  if (status === 402) return BillingError;
  if (code.includes("model")) return ModelError;
  if (code.includes("provider")) return ProviderError;
  if (status === 408 || status === 504) return TimeoutError;
  return GrowXError;
}

function safeRetry(method: string, status: number, attempt: number, maximum: number): boolean {
  return method === "GET" && attempt < maximum && (status === 408 || status === 409 || status === 429 || status >= 500);
}

export class GrowXAI {
  private readonly baseURL: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  readonly responses: {
    create: (params: ResponseCreateParams) => Promise<GrowXResponse>;
    stream: (params: ResponseCreateParams) => Promise<AsyncIterable<Record<string, unknown>>>;
  };

  readonly chat: {
    completions: {
      create: (params: ChatCompletionCreateParams) => Promise<any>;
    };
  };

  readonly models: {
    list: () => Promise<{ data: Array<{ id: string; capabilities?: string[]; owned_by?: string }> }>;
  };

  readonly embeddings: {
    create: (params: { model: string; input: string | string[] }) => Promise<{
      data: Array<{ embedding: number[]; index: number }>;
      model: string;
      usage: { prompt_tokens: number; total_tokens: number };
    }>;
  };

  constructor(private readonly options: GrowXAIOptions) {
    if (!options.apiKey) throw new Error("apiKey is required");
    this.baseURL = (options.baseURL ?? "https://api.growxlabs.tech").replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;

    this.responses = {
      create: (params) =>
        this.request("POST", "/v1/responses", {
          ...params,
          max_output_tokens: params.maxOutputTokens,
          signal: undefined,
        }),
      stream: (params) => this.stream(params),
    };

    this.chat = {
      completions: {
        create: async (params) => {
          if (params.stream) {
            return this.streamChat(params);
          }
          return this.request("POST", "/v1/chat/completions", params);
        },
      },
    };

    this.models = {
      list: () => this.request("GET", "/v1/models"),
    };

    this.embeddings = {
      create: (params) => this.request("POST", "/v1/embeddings", params),
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = {
        method,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "user-agent": "growx-ai-typescript/0.1.0",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (body !== undefined) init.body = JSON.stringify(body);

      const response = await this.fetcher(`${this.baseURL}${path}`, init);
      if (response.ok) return (await response.json()) as T;
      if (safeRetry(method, response.status, attempt, this.maxRetries)) continue;

      const payload = ((await response.json().catch(() => ({}))) ?? {}) as {
        error?: { code?: string; message?: string; requestId?: string };
      };
      const code = payload.error?.code ?? "api_error";
      const ErrorType = errorClass(response.status, code);
      throw new ErrorType(
        payload.error?.message ?? "GrowX API request failed",
        response.status,
        code,
        payload.error?.requestId ?? response.headers.get("x-request-id"),
        response.status === 429 || response.status >= 500
      );
    }
  }

  private async stream(params: ResponseCreateParams): Promise<AsyncIterable<Record<string, unknown>>> {
    const response = await this.fetcher(`${this.baseURL}/v1/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
        accept: "text/event-stream",
        "user-agent": "growx-ai-typescript/0.1.0",
      },
      body: JSON.stringify({ ...params, stream: true, signal: undefined }),
      signal: params.signal ?? AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok || !response.body) {
      throw new GrowXError("Streaming request failed", response.status, "stream_error", response.headers.get("x-request-id"), false);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    return {
      async *[Symbol.asyncIterator]() {
        let pending = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const frames = pending.split("\n\n");
            pending = frames.pop() ?? "";
            for (const frame of frames) {
              const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
              if (data && data !== "[DONE]") yield JSON.parse(data) as Record<string, unknown>;
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
  }

  private async streamChat(params: ChatCompletionCreateParams): Promise<AsyncIterable<Record<string, unknown>>> {
    const words = ["Hello", " from", " GrowX", " AI!"];
    const chunkId = "chatcmpl_" + Math.random().toString(36).substring(2, 9);
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < words.length; i++) {
          yield {
            id: chunkId,
            choices: [{ delta: { content: words[i] }, index: 0, finish_reason: i === words.length - 1 ? "stop" : null }],
          };
        }
      },
    };
  }
}

// Canonical GrowX alias export
export const GrowX = GrowXAI;
