import type {
  CanonicalCapability,
  GrowXProviderError,
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  NormalizedStreamEvent,
  ProviderExecutionContext,
  ProviderUsage,
} from "@growx/contracts";

export type ProviderHealthState =
  "healthy" | "degraded" | "unhealthy" | "unknown" | "maintenance";

export interface ProviderHealth {
  state: ProviderHealthState;
  checkedAt: string;
  latencyMs?: number | undefined;
  detail?: string | undefined;
}

export interface ProviderAdapter {
  readonly providerId: string;

  /**
   * Validates provider-level configuration parameters (e.g. baseUrl, apiVersion).
   */
  validateConfiguration(config: {
    baseUrl: string;
    apiVersion?: string | null | undefined;
  }): void;

  /**
   * Executes a non-streaming generation request and returns the normalized response.
   */
  execute(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<NormalizedGenerationResponse>;

  /**
   * Executes a streaming generation request and yields stream events.
   */
  stream(
    request: NormalizedGenerationRequest,
    context: ProviderExecutionContext,
  ): AsyncIterable<NormalizedStreamEvent>;

  /**
   * Normalizes unknown errors into GrowXProviderError.
   */
  normalizeError(error: unknown): GrowXProviderError;

  /**
   * Extracts canonical usage metrics from a raw provider response.
   */
  extractUsage(rawResponse: unknown): ProviderUsage;

  /**
   * Returns whether this adapter natively supports a given canonical capability.
   */
  supports(capability: CanonicalCapability): boolean;

  /**
   * Optional health probe interface.
   */
  healthProbe?(
    context: Pick<ProviderExecutionContext, "timeoutMs"> & {
      baseUrl: string;
      credential?: string | undefined;
      cancellationSignal?: AbortSignal | undefined;
    },
  ): Promise<ProviderHealth>;

  /**
   * Backward-compatible health probe method.
   */
  health?(options: {
    baseUrl: string;
    credential?: string | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<ProviderHealth>;

  /**
   * Backward-compatible generate method.
   */
  generate?(request: unknown, context: unknown): Promise<unknown>;

  /**
   * Backward-compatible embed method.
   */
  embed?(request: unknown, context?: unknown): Promise<unknown>;
}
