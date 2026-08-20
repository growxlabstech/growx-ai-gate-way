import type {
  CanonicalCapability,
  GrowXEmbeddingRequest,
  GrowXEmbeddingResponse,
  GrowXModelRequest,
  GrowXModelResponse,
  GrowXStreamEvent,
  GrowXUsage,
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  NormalizedStreamEvent,
  ProviderExecutionContext,
  ProviderUsage,
} from "@growx/contracts";
import { GrowXProviderError } from "@growx/contracts";
import type {
  ProviderAdapter,
  ProviderHealth,
} from "@growx/provider-sdk";

export interface MockProviderOptions {
  text?: string | undefined;
  delayMs?: number | undefined;
  failure?: "rate_limit" | "server" | "timeout" | undefined;
  malformed?: boolean | undefined;
}

export class MockAIProvider implements ProviderAdapter {
  readonly providerId: string;

  constructor(
    private readonly options: MockProviderOptions = {},
    providerId = "mock"
  ) {
    this.providerId = providerId;
  }

  validateConfiguration(_config: { baseUrl: string; apiVersion?: string | null | undefined }): void {
    // No-op for mock
  }

  supports(_capability: CanonicalCapability): boolean {
    return true;
  }

  extractUsage(_rawResponse?: unknown): ProviderUsage {
    return {
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      source: "provider_reported",
    };
  }

  normalizeUsage(): GrowXUsage {
    return { inputTokens: 3, outputTokens: 2, totalTokens: 5 };
  }

  normalizeError(error: unknown): GrowXProviderError {
    if (error instanceof GrowXProviderError) return error;
    if (error instanceof DOMException && error.name === "AbortError") {
      return new GrowXProviderError("request_cancelled", "Cancelled", false, 499);
    }
    return new GrowXProviderError("provider_server_error", "Mock failure", true, 503);
  }

  async execute(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext
  ): Promise<NormalizedGenerationResponse> {
    await this.pause(context.cancellationSignal);

    if (this.options.failure) {
      throw new GrowXProviderError(
        this.options.failure === "rate_limit"
          ? "provider_rate_limit"
          : this.options.failure === "timeout"
          ? "provider_timeout"
          : "provider_server_error",
        "Injected mock failure",
        true,
        this.options.failure === "rate_limit" ? 429 : 503
      );
    }

    if (this.options.malformed) {
      throw new GrowXProviderError("provider_server_error", "Malformed response", true, 502);
    }

    const startedAt = new Date();
    const completedAt = new Date();

    return {
      requestId: request.requestId,
      canonicalModelId: request.canonicalModelId,
      providerId: this.providerId,
      providerModelId: request.providerModelId,
      output: [
        {
          role: "assistant",
          content: this.options.text ?? "mock response",
        },
      ],
      finishReason: "stop",
      usage: this.extractUsage(),
      timing: {
        startedAt,
        completedAt,
        latencyMs: this.options.delayMs ?? 0,
      },
    };
  }

  async generate(
    request: GrowXModelRequest,
    context: {
      providerModelId?: string | undefined;
      baseUrl?: string | undefined;
      credential?: string | undefined;
      signal?: AbortSignal | undefined;
      requestTimeoutMs?: number | undefined;
    }
  ): Promise<GrowXModelResponse> {
    await this.pause(context.signal);

    if (this.options.failure) {
      throw new GrowXProviderError(
        this.options.failure === "rate_limit"
          ? "provider_rate_limit"
          : this.options.failure === "timeout"
          ? "provider_timeout"
          : "provider_server_error",
        "Injected failure",
        true,
        503
      );
    }

    if (this.options.malformed) {
      throw new GrowXProviderError("provider_server_error", "Malformed response", true, 502);
    }

    const now = new Date().toISOString();
    return {
      id: `resp_${request.requestId}`,
      model: request.model,
      provider: this.providerId,
      output: [
        {
          type: "message",
          role: "assistant",
          content: this.options.text ?? "mock response",
        },
      ],
      usage: this.normalizeUsage(),
      timing: {
        startedAt: now,
        completedAt: now,
        latencyMs: this.options.delayMs ?? 0,
      },
    };
  }

  async *stream(
    request: any,
    context: any
  ): AsyncIterable<any> {
    // Support both NormalizedGenerationRequest and legacy GrowXModelRequest
    if (request.canonicalModelId) {
      const result = await this.execute(request, context);
      const responseId = `resp_${request.requestId.replace(/^req_/, "")}`;

      yield {
        requestId: request.requestId,
        responseId,
        sequence: 1,
        type: "response.started",
        timestamp: new Date().toISOString(),
      };

      yield {
        requestId: request.requestId,
        responseId,
        sequence: 2,
        type: "output_text.delta",
        timestamp: new Date().toISOString(),
        delta: (result.output[0]?.content as string) ?? "mock response",
      };

      yield {
        requestId: request.requestId,
        responseId,
        sequence: 3,
        type: "output_text.done",
        timestamp: new Date().toISOString(),
      };

      yield {
        requestId: request.requestId,
        responseId,
        sequence: 4,
        type: "usage",
        timestamp: new Date().toISOString(),
        usage: result.usage,
      };

      yield {
        requestId: request.requestId,
        responseId,
        sequence: 5,
        type: "response.completed",
        timestamp: new Date().toISOString(),
        finishReason: "stop",
        response: result,
        usage: result.usage,
      };
    } else {
      const result = await this.generate(request, context);
      yield {
        requestId: request.requestId,
        responseId: result.id,
        sequence: 1,
        type: "response.created",
        timestamp: new Date().toISOString(),
      };
      yield {
        requestId: request.requestId,
        responseId: result.id,
        sequence: 2,
        type: "output_text.delta",
        timestamp: new Date().toISOString(),
        delta: result.output[0]?.content,
      };
      yield {
        requestId: request.requestId,
        responseId: result.id,
        sequence: 3,
        type: "response.completed",
        timestamp: new Date().toISOString(),
        response: result,
        usage: result.usage,
      };
    }
  }

  async embed(request: GrowXEmbeddingRequest, _context?: any): Promise<GrowXEmbeddingResponse> {
    return {
      id: `resp_${request.requestId}`,
      model: request.model,
      provider: this.providerId,
      vectors: [{ index: 0, embedding: [0.1, 0.2] }],
      usage: this.normalizeUsage(),
    };
  }

  async healthProbe(): Promise<ProviderHealth> {
    return { state: "healthy", checkedAt: new Date().toISOString() };
  }

  async health(): Promise<ProviderHealth> {
    return this.healthProbe();
  }

  private pause(signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const timer = setTimeout(resolve, this.options.delayMs ?? 0);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      }
    });
  }
}
