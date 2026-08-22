import { Decimal } from "@growx/money";
import { generateId } from "@growx/ids";
import type {
  Currency,
  ProviderCostLine,
  ProviderCostRecord,
  ProviderCostResult,
  ProviderCostStatus,
  ProviderRate,
  ProviderScheduleWithRates,
  UsageType,
} from "./types.js";
import { ProviderPriceResolver } from "./provider-price-resolver.js";

export interface ProviderAttemptCostInput {
  id: string;
  attemptNumber: number;
  providerId: string;
  providerRouteId?: string | undefined;
  providerModelId: string;
  region?: string | undefined;
  credentialId?: string | undefined;
  status: string; // "completed" | "failed" | "cancelled" | "started"
  usageSource?: string | undefined; // "provider_reported" | "estimated" | "unavailable"
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
}

export interface CalculateProviderCostParams {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  canonicalModelId: string;
  attempts: ProviderAttemptCostInput[];
  executionSource?: "live_provider" | "cache_exact" | "synthetic" | undefined;
  targetDate?: Date | undefined;
  currency?: Currency | undefined;
}

export class ProviderCostCalculator {
  private readonly priceResolver: ProviderPriceResolver;

  constructor(priceResolver: ProviderPriceResolver) {
    this.priceResolver = priceResolver;
  }

  public calculateRequestCost(
    params: CalculateProviderCostParams,
  ): ProviderCostResult {
    const currency = params.currency ?? "USD";
    const targetDate = params.targetDate ?? new Date();

    // 1. Exact Cache Hit: zero provider calls made -> exactly $0 cost, 0 cost lines
    if (
      params.executionSource === "cache_exact" ||
      params.attempts.length === 0
    ) {
      return {
        requestId: params.requestId,
        currency,
        subtotal: Decimal.ZERO,
        costStatus: "exact",
        lines: [],
        priceVersionSet: [],
        retryCost: Decimal.ZERO,
        fallbackCost: Decimal.ZERO,
        successfulAttemptCost: Decimal.ZERO,
      };
    }

    const lines: ProviderCostLine[] = [];
    const priceVersionSet = new Set<string>();
    let overallCostStatus: ProviderCostStatus = "exact";

    let retryCost = Decimal.ZERO;
    let fallbackCost = Decimal.ZERO;
    let successfulAttemptCost = Decimal.ZERO;

    for (let i = 0; i < params.attempts.length; i++) {
      const attempt = params.attempts[i]!;
      const prevAttempt = i > 0 ? params.attempts[i - 1] : undefined;

      const isFallback =
        prevAttempt !== undefined &&
        prevAttempt.providerId !== attempt.providerId;

      // Resolve price schedule for this attempt
      const resolved = this.priceResolver.resolveSchedule({
        providerId: attempt.providerId,
        providerRouteId: attempt.providerRouteId,
        canonicalModelId: params.canonicalModelId,
        providerModelId: attempt.providerModelId,
        region: attempt.region,
        credentialId: attempt.credentialId,
        currency,
        targetDate,
        scheduleId: attempt.priceScheduleId,
        version: attempt.priceVersion,
      });

      let attemptCost = Decimal.ZERO;

      if (!resolved) {
        // Missing provider price schedule
        const hasUsage =
          BigInt(attempt.usage.inputTokens) > 0n ||
          BigInt(attempt.usage.outputTokens) > 0n;

        if (hasUsage) {
          overallCostStatus = "unpriced";
        }
        continue;
      }

      const schedule = resolved.schedule;
      priceVersionSet.add(`${schedule.id}:v${schedule.version}`);

      // Track attempt usage quality
      if (
        attempt.usageSource === "estimated" &&
        overallCostStatus === "exact"
      ) {
        overallCostStatus = "estimated";
      } else if (
        attempt.usageSource === "unavailable" &&
        overallCostStatus !== "unpriced"
      ) {
        overallCostStatus = "incomplete";
      }

      const ratesMap = new Map<UsageType, ProviderRate>();
      for (const r of resolved.rates) {
        ratesMap.set(r.usageType, r);
      }

      // Calculate Input Tokens Cost
      const inputQty = BigInt(attempt.usage.inputTokens);
      if (inputQty > 0n) {
        const inputRate = ratesMap.get("input_tokens");
        if (inputRate) {
          const lineCost = Decimal.fromUnits(
            inputQty,
            inputRate.price,
            inputRate.perUnits,
          );
          attemptCost = attemptCost.add(lineCost);
          lines.push(
            this.createCostLine({
              requestId: params.requestId,
              attemptId: attempt.id,
              providerId: attempt.providerId,
              providerRouteId: attempt.providerRouteId,
              canonicalModelId: params.canonicalModelId,
              usageType: "input_tokens",
              quantity: inputQty,
              unit: inputRate.unit,
              scheduleId: schedule.id,
              version: schedule.version,
              rate: inputRate.price,
              perUnits: inputRate.perUnits,
              amount: lineCost,
              currency,
              source: schedule.source,
            }),
          );
        } else {
          overallCostStatus = "unpriced";
        }
      }

      // Calculate Output Tokens Cost
      const outputQty = BigInt(attempt.usage.outputTokens);
      if (outputQty > 0n) {
        const outputRate = ratesMap.get("output_tokens");
        if (outputRate) {
          const lineCost = Decimal.fromUnits(
            outputQty,
            outputRate.price,
            outputRate.perUnits,
          );
          attemptCost = attemptCost.add(lineCost);
          lines.push(
            this.createCostLine({
              requestId: params.requestId,
              attemptId: attempt.id,
              providerId: attempt.providerId,
              providerRouteId: attempt.providerRouteId,
              canonicalModelId: params.canonicalModelId,
              usageType: "output_tokens",
              quantity: outputQty,
              unit: outputRate.unit,
              scheduleId: schedule.id,
              version: schedule.version,
              rate: outputRate.price,
              perUnits: outputRate.perUnits,
              amount: lineCost,
              currency,
              source: schedule.source,
            }),
          );
        } else {
          overallCostStatus = "unpriced";
        }
      }

      // Calculate Cached Input Tokens Cost
      const cachedQty =
        attempt.usage.cachedInputTokens !== undefined
          ? BigInt(attempt.usage.cachedInputTokens)
          : 0n;
      if (cachedQty > 0n) {
        const cachedRate =
          ratesMap.get("cached_input_tokens") ?? ratesMap.get("input_tokens");
        if (cachedRate) {
          const lineCost = Decimal.fromUnits(
            cachedQty,
            cachedRate.price,
            cachedRate.perUnits,
          );
          attemptCost = attemptCost.add(lineCost);
          lines.push(
            this.createCostLine({
              requestId: params.requestId,
              attemptId: attempt.id,
              providerId: attempt.providerId,
              providerRouteId: attempt.providerRouteId,
              canonicalModelId: params.canonicalModelId,
              usageType: "cached_input_tokens",
              quantity: cachedQty,
              unit: cachedRate.unit,
              scheduleId: schedule.id,
              version: schedule.version,
              rate: cachedRate.price,
              perUnits: cachedRate.perUnits,
              amount: lineCost,
              currency,
              source: schedule.source,
            }),
          );
        }
      }

      // Calculate Reasoning Tokens Cost
      const reasoningQty =
        attempt.usage.reasoningTokens !== undefined
          ? BigInt(attempt.usage.reasoningTokens)
          : 0n;
      if (reasoningQty > 0n) {
        const reasoningRate =
          ratesMap.get("reasoning_tokens") ?? ratesMap.get("output_tokens");
        if (reasoningRate) {
          const lineCost = Decimal.fromUnits(
            reasoningQty,
            reasoningRate.price,
            reasoningRate.perUnits,
          );
          attemptCost = attemptCost.add(lineCost);
          lines.push(
            this.createCostLine({
              requestId: params.requestId,
              attemptId: attempt.id,
              providerId: attempt.providerId,
              providerRouteId: attempt.providerRouteId,
              canonicalModelId: params.canonicalModelId,
              usageType: "reasoning_tokens",
              quantity: reasoningQty,
              unit: reasoningRate.unit,
              scheduleId: schedule.id,
              version: schedule.version,
              rate: reasoningRate.price,
              perUnits: reasoningRate.perUnits,
              amount: lineCost,
              currency,
              source: schedule.source,
            }),
          );
        }
      }

      // Calculate Search Calls Cost
      const searchQty =
        attempt.usage.searchCalls !== undefined
          ? BigInt(attempt.usage.searchCalls)
          : 0n;
      if (searchQty > 0n) {
        const searchRate = ratesMap.get("search_calls");
        if (searchRate) {
          const lineCost = Decimal.fromUnits(
            searchQty,
            searchRate.price,
            searchRate.perUnits,
          );
          attemptCost = attemptCost.add(lineCost);
          lines.push(
            this.createCostLine({
              requestId: params.requestId,
              attemptId: attempt.id,
              providerId: attempt.providerId,
              providerRouteId: attempt.providerRouteId,
              canonicalModelId: params.canonicalModelId,
              usageType: "search_calls",
              quantity: searchQty,
              unit: searchRate.unit,
              scheduleId: schedule.id,
              version: schedule.version,
              rate: searchRate.price,
              perUnits: searchRate.perUnits,
              amount: lineCost,
              currency,
              source: schedule.source,
            }),
          );
        }
      }

      // Breakdown cost allocation
      if (attempt.status === "completed") {
        if (isFallback) {
          fallbackCost = fallbackCost.add(attemptCost);
        }
        successfulAttemptCost = successfulAttemptCost.add(attemptCost);
      } else {
        // Failed or cancelled attempt
        if (isFallback) {
          fallbackCost = fallbackCost.add(attemptCost);
        } else {
          retryCost = retryCost.add(attemptCost);
        }
      }
    }

    const subtotal = lines.reduce(
      (acc, line) => acc.add(line.amount),
      Decimal.ZERO,
    );

    return {
      requestId: params.requestId,
      currency,
      subtotal,
      costStatus: overallCostStatus,
      lines,
      priceVersionSet: Array.from(priceVersionSet),
      retryCost,
      fallbackCost,
      successfulAttemptCost,
    };
  }

  private createCostLine(params: {
    requestId: string;
    attemptId?: string | undefined;
    providerId: string;
    providerRouteId?: string | undefined;
    canonicalModelId: string;
    usageType: UsageType;
    quantity: bigint;
    unit: string;
    scheduleId: string;
    version: number;
    rate: Decimal;
    perUnits: bigint;
    amount: Decimal;
    currency: Currency;
    source: string;
  }): ProviderCostLine {
    return {
      id: generateId("costln"),
      costRecordId: generateId("costrec"),
      requestId: params.requestId,
      attemptId: params.attemptId,
      providerId: params.providerId,
      providerRouteId: params.providerRouteId,
      canonicalModelId: params.canonicalModelId,
      usageType: params.usageType,
      quantity: params.quantity,
      unit: params.unit as any,
      priceScheduleId: params.scheduleId,
      priceVersion: params.version,
      rate: params.rate,
      perUnits: params.perUnits,
      amount: params.amount,
      currency: params.currency,
      source: params.source,
      createdAt: new Date(),
    };
  }
}
