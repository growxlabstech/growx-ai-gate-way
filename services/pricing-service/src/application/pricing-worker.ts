import type { PricingService, PriceRequestParams } from "./pricing-service.js";

export interface UsageRecordedEventPayload {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId: string;
  executionSource?: "live_provider" | "cache_exact" | "synthetic" | undefined;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    providerId: string;
    providerRouteId?: string | undefined;
    providerModelId: string;
    region?: string | undefined;
    credentialId?: string | undefined;
    status: string;
    usageSource?: string | undefined;
    priceScheduleId?: string | undefined;
    priceVersion?: number | undefined;
    usage: {
      inputTokens: number | bigint;
      outputTokens: number | bigint;
      cachedInputTokens?: number | bigint | undefined;
      reasoningTokens?: number | bigint | undefined;
      imageUnits?: number | bigint | undefined;
      audioSeconds?: number | bigint | undefined;
      searchCalls?: number | bigint | undefined;
    };
  }>;
  logicalUsage: {
    inputTokens: number | bigint;
    outputTokens: number | bigint;
    cachedInputTokens?: number | bigint | undefined;
    reasoningTokens?: number | bigint | undefined;
    imageUnits?: number | bigint | undefined;
    audioSeconds?: number | bigint | undefined;
    searchCalls?: number | bigint | undefined;
  };
  policyId?: string | undefined;
  currency?: string | undefined;
}

export class PricingWorker {
  private readonly pricingService: PricingService;
  private isRunning = false;

  constructor(pricingService: PricingService) {
    this.pricingService = pricingService;
  }

  /**
   * Processes a single usage.recorded.v1 event asynchronously.
   */
  public async handleUsageRecorded(event: UsageRecordedEventPayload): Promise<void> {
    const params: PriceRequestParams = {
      requestId: event.requestId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      apiKeyId: event.apiKeyId,
      canonicalModelId: event.canonicalModelId,
      executionSource: event.executionSource,
      attempts: event.attempts ?? [],
      logicalUsage: event.logicalUsage ?? { inputTokens: 0n, outputTokens: 0n },
      policyId: event.policyId,
      currency: event.currency as any,
    };

    await this.pricingService.priceRequest(params);
  }
}
