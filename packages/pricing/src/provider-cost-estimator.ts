import { Decimal } from "@growx/money";
import type { Currency, UsageType } from "./types.js";
import { ProviderPriceResolver } from "./provider-price-resolver.js";

export interface RouteCandidateLike {
  routeId: string;
  providerId: string;
  providerModelId: string;
  region?: string | undefined;
  credentialId?: string | undefined;
  canonicalModelId?: string | undefined;
  estimatedCost?: number | undefined;
  pricing?: {
    inputPricePerMillionMinor: number;
    outputPricePerMillionMinor: number;
    cachedInputPricePerMillionMinor?: number | null | undefined;
    reasoningPricePerMillionMinor?: number | null | undefined;
    currency: string;
  } | undefined;
}

export interface EstimatedUsageInput {
  inputTokens?: number | bigint | undefined;
  outputTokens?: number | bigint | undefined;
  cachedInputTokens?: number | bigint | undefined;
  reasoningTokens?: number | bigint | undefined;
  imageUnits?: number | bigint | undefined;
  audioSeconds?: number | bigint | undefined;
  searchCalls?: number | bigint | undefined;
}

export class ProviderCostEstimator {
  private readonly priceResolver: ProviderPriceResolver;

  constructor(priceResolver: ProviderPriceResolver) {
    this.priceResolver = priceResolver;
  }

  /**
   * Fast synchronous in-memory estimation of provider cost for a candidate route.
   */
  public estimateRouteCost(
    candidate: RouteCandidateLike,
    usage?: EstimatedUsageInput | undefined,
    currency: Currency = "USD"
  ): Decimal | undefined {
    const inputTokens = BigInt(usage?.inputTokens ?? 1000);
    const outputTokens = BigInt(usage?.outputTokens ?? 500);
    const cachedTokens = BigInt(usage?.cachedInputTokens ?? 0);
    const reasoningTokens = BigInt(usage?.reasoningTokens ?? 0);

    // 1. Try authoritative pricing resolver first
    const resolved = this.priceResolver.resolveSchedule({
      providerId: candidate.providerId,
      providerRouteId: candidate.routeId,
      providerModelId: candidate.providerModelId,
      canonicalModelId: candidate.canonicalModelId,
      region: candidate.region,
      credentialId: candidate.credentialId,
      currency,
    });

    if (resolved) {
      let totalCost = Decimal.ZERO;
      const ratesMap = new Map<UsageType, Decimal>();
      const perUnitsMap = new Map<UsageType, bigint>();

      for (const r of resolved.rates) {
        ratesMap.set(r.usageType, r.price);
        perUnitsMap.set(r.usageType, r.perUnits);
      }

      // Input tokens
      const inPrice = ratesMap.get("input_tokens");
      const inUnits = perUnitsMap.get("input_tokens") ?? 1_000_000n;
      if (inPrice && inputTokens > 0n) {
        totalCost = totalCost.add(Decimal.fromUnits(inputTokens, inPrice, inUnits));
      }

      // Output tokens
      const outPrice = ratesMap.get("output_tokens");
      const outUnits = perUnitsMap.get("output_tokens") ?? 1_000_000n;
      if (outPrice && outputTokens > 0n) {
        totalCost = totalCost.add(Decimal.fromUnits(outputTokens, outPrice, outUnits));
      }

      // Cached tokens
      const cachePrice = ratesMap.get("cached_input_tokens");
      const cacheUnits = perUnitsMap.get("cached_input_tokens") ?? 1_000_000n;
      if (cachePrice && cachedTokens > 0n) {
        totalCost = totalCost.add(Decimal.fromUnits(cachedTokens, cachePrice, cacheUnits));
      }

      // Reasoning tokens
      const reasoningPrice = ratesMap.get("reasoning_tokens") ?? outPrice;
      const reasoningUnits = perUnitsMap.get("reasoning_tokens") ?? outUnits;
      if (reasoningPrice && reasoningTokens > 0n) {
        totalCost = totalCost.add(Decimal.fromUnits(reasoningTokens, reasoningPrice, reasoningUnits));
      }

      return totalCost;
    }

    // 2. Fallback to candidate-embedded pricing metadata if available
    if (candidate.estimatedCost !== undefined) {
      return Decimal.from(candidate.estimatedCost);
    }

    if (candidate.pricing) {
      const inCost = Decimal.fromUnits(
        inputTokens,
        Decimal.from(candidate.pricing.inputPricePerMillionMinor).div(100),
        1_000_000n
      );
      const outCost = Decimal.fromUnits(
        outputTokens,
        Decimal.from(candidate.pricing.outputPricePerMillionMinor).div(100),
        1_000_000n
      );
      return inCost.add(outCost);
    }

    return undefined;
  }

  /**
   * Batch estimation across multiple candidate routes without N+1 overhead.
   */
  public estimateBatch(
    candidates: RouteCandidateLike[],
    usage?: EstimatedUsageInput | undefined,
    currency: Currency = "USD"
  ): Map<string, Decimal> {
    const results = new Map<string, Decimal>();

    for (const candidate of candidates) {
      const cost = this.estimateRouteCost(candidate, usage, currency);
      if (cost !== undefined) {
        results.set(candidate.routeId, cost);
      }
    }

    return results;
  }
}
