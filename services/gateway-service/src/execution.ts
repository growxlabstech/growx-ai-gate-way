import {
  GrowXProviderError,
  type GrowXEmbeddingRequest,
  type GrowXEmbeddingResponse,
  type GrowXModelRequest,
  type GrowXModelResponse,
  type GrowXStreamEvent,
  type ModelCapability,
} from "@growx/contracts";
import type { ProviderRegistry } from "@growx/provider-service";
import type {
  LegacyRouteTarget as RouteTarget,
  LegacyRoutingDecision as RoutingDecision,
  RoutingService,
} from "@growx/routing-service";

export interface ExecutionEvents {
  emit(type: string, payload: Record<string, unknown>): Promise<void>;
}

export interface ExecutionOptions {
  requestTimeoutMs: number;
  maxAttempts: number;
  retryBaseMs: number;
}

export class GatewayExecutionEngine {
  constructor(
    private readonly routing: RoutingService,
    private readonly providers: ProviderRegistry,
    private readonly events: ExecutionEvents,
    private readonly options: ExecutionOptions,
  ) {
    if (options.maxAttempts < 1 || options.maxAttempts > 5) {
      throw new Error("maxAttempts must be between 1 and 5");
    }
  }

  async execute(
    request: GrowXModelRequest,
    required: readonly ModelCapability[],
    signal = new AbortController().signal,
  ): Promise<GrowXModelResponse> {
    const decision = this.decide(request, required);
    await this.events.emit("gateway.routing.completed", {
      requestId: request.requestId,
      decisionId: decision.decisionId,
    });

    const targets: RouteTarget[] = [
      {
        providerId: decision.providerId,
        providerModelId: decision.providerModelId,
        publicModelId: decision.resolvedModel,
      },
      ...decision.fallbackChain,
    ];

    let last: GrowXProviderError | undefined;
    for (
      let attempt = 0;
      attempt < Math.min(targets.length, this.options.maxAttempts);
      attempt++
    ) {
      const target = targets[attempt]!;
      try {
        const runtime = await this.providers.runtime(
          target.providerId,
          request.environmentId,
        );

        await this.events.emit("gateway.provider.attempted", {
          requestId: request.requestId,
          providerId: target.providerId,
          attempt: attempt + 1,
        });

        if (!runtime.adapter.generate) {
          throw new GrowXProviderError(
            "provider_unavailable",
            "Provider does not implement generate.",
            false,
            500,
          );
        }

        const result = (await runtime.adapter.generate(request as any, {
          providerModelId: target.providerModelId,
          baseUrl: runtime.record.baseUrl,
          credential: runtime.credential,
          signal,
          requestTimeoutMs: this.options.requestTimeoutMs,
        })) as GrowXModelResponse;

        return result;
      } catch (error) {
        last =
          error instanceof GrowXProviderError
            ? error
            : new GrowXProviderError(
                "provider_unavailable",
                "Provider unavailable.",
                true,
                503,
                { cause: error },
              );

        await this.events.emit("gateway.provider.failed", {
          requestId: request.requestId,
          providerId: target.providerId,
          code: last.code,
        });

        if (!last.retryable || signal.aborted) {
          throw last;
        }

        if (attempt + 1 < Math.min(targets.length, this.options.maxAttempts)) {
          await this.events.emit("gateway.provider.fallback", {
            requestId: request.requestId,
            from: target.providerId,
            to: targets[attempt + 1]!.providerId,
          });
          await this.delay(this.options.retryBaseMs * 2 ** attempt, signal);
        }
      }
    }

    throw (
      last ??
      new GrowXProviderError(
        "model_unavailable",
        "No route available.",
        false,
        503,
      )
    );
  }

  async *stream(
    request: GrowXModelRequest,
    required: readonly ModelCapability[],
    signal = new AbortController().signal,
  ): AsyncIterable<GrowXStreamEvent> {
    const decision = this.decide(request, [...required, "streaming"]);
    const runtime = await this.providers.runtime(
      decision.providerId,
      request.environmentId,
    );

    let emitted = false;
    try {
      for await (const event of runtime.adapter.stream(
        request as any,
        {
          providerModelId: decision.providerModelId,
          baseUrl: runtime.record.baseUrl,
          credential: runtime.credential,
          signal,
          requestTimeoutMs: this.options.requestTimeoutMs,
        } as any,
      ) as any) {
        emitted ||= event.type === "output_text.delta";
        yield event as GrowXStreamEvent;
      }
    } catch (error) {
      if (emitted) throw error;
      throw runtime.adapter.normalizeError(error);
    }
  }

  async embed(
    request: GrowXEmbeddingRequest,
    signal = new AbortController().signal,
  ): Promise<GrowXEmbeddingResponse> {
    const decision = this.routing.decide({
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      requestedModel: request.model,
      requiredCapabilities: ["embeddings"],
    });

    const runtime = await this.providers.runtime(
      decision.providerId,
      request.environmentId,
    );

    if (!runtime.adapter.embed) {
      throw new GrowXProviderError(
        "model_capability_not_supported",
        "The selected provider does not support embeddings.",
        false,
        400,
      );
    }

    return (await runtime.adapter.embed(request, {
      providerModelId: decision.providerModelId,
      baseUrl: runtime.record.baseUrl,
      credential: runtime.credential,
      signal,
      requestTimeoutMs: this.options.requestTimeoutMs,
    })) as GrowXEmbeddingResponse;
  }

  private decide(
    request: GrowXModelRequest,
    required: readonly ModelCapability[],
  ): RoutingDecision {
    return this.routing.decide({
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      requestedModel: request.model,
      requiredCapabilities: required,
    });
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(
            new GrowXProviderError(
              "request_cancelled",
              "Request cancelled.",
              false,
              499,
            ),
          );
        },
        { once: true },
      );
    });
  }
}
