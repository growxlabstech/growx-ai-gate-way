import { Decimal } from "@growx/money";
import { generateId } from "@growx/ids";
import type {
  Currency,
  CustomerPriceLine,
  CustomerPriceResult,
  CustomerPriceStatus,
  CustomerPricingPolicy,
  CustomerRate,
  CustomerRateSchedule,
  UsageType,
} from "./types.js";
import { CustomerPricingResolver } from "./customer-pricing-resolver.js";

export interface CalculateCustomerPriceParams {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId: string;
  logicalUsage: {
    inputTokens: number | bigint;
    outputTokens: number | bigint;
    cachedInputTokens?: number | bigint | undefined;
    reasoningTokens?: number | bigint | undefined;
    imageUnits?: number | bigint | undefined;
    audioSeconds?: number | bigint | undefined;
    searchCalls?: number | bigint | undefined;
  };
  totalProviderUsage?: {
    inputTokens: number | bigint;
    outputTokens: number | bigint;
    cachedInputTokens?: number | bigint | undefined;
    reasoningTokens?: number | bigint | undefined;
  } | undefined;
  providerCost?: Decimal | undefined;
  executionSource?: "live_provider" | "cache_exact" | "synthetic" | undefined;
  policyId?: string | undefined;
  currency?: Currency | undefined;
  targetDate?: Date | undefined;
}

export class CustomerPriceCalculator {
  private readonly policyResolver: CustomerPricingResolver;

  constructor(policyResolver: CustomerPricingResolver) {
    this.policyResolver = policyResolver;
  }

  public calculateRequestPrice(params: CalculateCustomerPriceParams): CustomerPriceResult {
    const currency = params.currency ?? "USD";
    const targetDate = params.targetDate ?? new Date();
    const providerCost = params.providerCost ?? Decimal.ZERO;
    const isCacheHit = params.executionSource === "cache_exact";

    const resolvedPolicyWithRates = this.policyResolver.resolvePolicy({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      policyId: params.policyId,
      currency,
      targetDate,
    });

    if (!resolvedPolicyWithRates) {
      // Missing customer pricing policy -> mark unpriced
      return {
        requestId: params.requestId,
        currency,
        subtotal: Decimal.ZERO,
        pricingStatus: "unpriced",
        lines: [],
        pricingPolicyId: "unknown",
        pricingPolicyVersion: 0,
        grossProfit: providerCost.neg(),
        grossMargin: null,
        marginBasisPoints: null,
      };
    }

    const policy = resolvedPolicyWithRates.policy;

    // 1. Cache Pricing Mode check
    if (isCacheHit) {
      if (policy.cachePricingMode === "free") {
        return {
          requestId: params.requestId,
          currency,
          subtotal: Decimal.ZERO,
          pricingStatus: "free",
          lines: [],
          pricingPolicyId: policy.id,
          pricingPolicyVersion: policy.version,
          grossProfit: Decimal.ZERO,
          grossMargin: Decimal.ZERO,
          marginBasisPoints: 0n,
        };
      }
    }

    // 2. Select Usage based on Retry Overhead Policy
    // Default is absorbed_by_growx: customer is billed only for the logical usage of the successful request!
    const effectiveUsage =
      policy.retryOverheadPolicy === "passed_through" && params.totalProviderUsage
        ? params.totalProviderUsage
        : params.logicalUsage;

    const lines: CustomerPriceLine[] = [];
    let subtotal = Decimal.ZERO;
    let pricingStatus: CustomerPriceStatus = "final";

    // 3. Pricing Models
    if (policy.pricingModel === "markup_over_provider_cost") {
      // Markup over provider cost
      let markupMultiplier = Decimal.ONE;
      if (policy.markupBasisPoints !== undefined && policy.markupBasisPoints > 0n) {
        // e.g. 2000 bps = 20% -> 1 + (2000 / 10000) = 1.20
        const markupFraction = Decimal.from(policy.markupBasisPoints).div(10000);
        markupMultiplier = Decimal.ONE.add(markupFraction);
      } else if (policy.markupMultiplier !== undefined) {
        markupMultiplier = policy.markupMultiplier;
      }

      subtotal = providerCost.mul(markupMultiplier);

      if (policy.fixedFee !== undefined && policy.fixedFee.gt(0)) {
        subtotal = subtotal.add(policy.fixedFee);
      }

      // Apply cache discount if applicable
      if (isCacheHit && policy.cachePricingMode === "discount_percentage" && policy.cacheDiscountPercentage) {
        const discountFactor = Decimal.ONE.sub(policy.cacheDiscountPercentage);
        subtotal = subtotal.mul(discountFactor);
      }

      lines.push({
        id: generateId("prcln"),
        priceRecordId: generateId("prcrec"),
        usageType: "total_tokens",
        quantity: BigInt(effectiveUsage.inputTokens) + BigInt(effectiveUsage.outputTokens),
        unit: "token",
        rate: markupMultiplier,
        perUnits: 1n,
        amount: subtotal,
        ruleType: "markup_over_provider_cost",
        createdAt: new Date(),
      });
    } else {
      // fixed_model_rate or usage_rate: bill based on rate schedule for canonical model
      const rateSchedule = resolvedPolicyWithRates.rateSchedules.find((rs) => {
        if (rs.schedule.canonicalModelId) {
          return rs.schedule.canonicalModelId.toLowerCase() === params.canonicalModelId.toLowerCase();
        }
        return true; // Default schedule
      });

      if (!rateSchedule || rateSchedule.rates.length === 0) {
        // No rate schedule found for model -> unpriced
        return {
          requestId: params.requestId,
          currency,
          subtotal: Decimal.ZERO,
          pricingStatus: "unpriced",
          lines: [],
          pricingPolicyId: policy.id,
          pricingPolicyVersion: policy.version,
          grossProfit: providerCost.neg(),
          grossMargin: null,
          marginBasisPoints: null,
        };
      }

      const ratesMap = new Map<UsageType, CustomerRate>();
      for (const r of rateSchedule.rates) {
        ratesMap.set(r.usageType, r);
      }

      const cacheDiscountFactor =
        isCacheHit && policy.cachePricingMode === "discount_percentage" && policy.cacheDiscountPercentage
          ? Decimal.ONE.sub(policy.cacheDiscountPercentage)
          : Decimal.ONE;

      // Input Tokens
      const inputQty = BigInt(effectiveUsage.inputTokens);
      if (inputQty > 0n) {
        const rate = ratesMap.get("input_tokens");
        if (rate) {
          let lineCost = Decimal.fromUnits(inputQty, rate.price, rate.perUnits);
          lineCost = lineCost.mul(cacheDiscountFactor);
          subtotal = subtotal.add(lineCost);
          lines.push({
            id: generateId("prcln"),
            priceRecordId: generateId("prcrec"),
            usageType: "input_tokens",
            quantity: inputQty,
            unit: rate.unit,
            rate: rate.price,
            perUnits: rate.perUnits,
            amount: lineCost,
            ruleType: "fixed_model_rate",
            createdAt: new Date(),
          });
        }
      }

      // Output Tokens
      const outputQty = BigInt(effectiveUsage.outputTokens);
      if (outputQty > 0n) {
        const rate = ratesMap.get("output_tokens");
        if (rate) {
          let lineCost = Decimal.fromUnits(outputQty, rate.price, rate.perUnits);
          lineCost = lineCost.mul(cacheDiscountFactor);
          subtotal = subtotal.add(lineCost);
          lines.push({
            id: generateId("prcln"),
            priceRecordId: generateId("prcrec"),
            usageType: "output_tokens",
            quantity: outputQty,
            unit: rate.unit,
            rate: rate.price,
            perUnits: rate.perUnits,
            amount: lineCost,
            ruleType: "fixed_model_rate",
            createdAt: new Date(),
          });
        }
      }

      // Cached Input Tokens
      const cachedQty = effectiveUsage.cachedInputTokens !== undefined ? BigInt(effectiveUsage.cachedInputTokens) : 0n;
      if (cachedQty > 0n) {
        const rate = ratesMap.get("cached_input_tokens") ?? ratesMap.get("input_tokens");
        if (rate) {
          let lineCost = Decimal.fromUnits(cachedQty, rate.price, rate.perUnits);
          lineCost = lineCost.mul(cacheDiscountFactor);
          subtotal = subtotal.add(lineCost);
          lines.push({
            id: generateId("prcln"),
            priceRecordId: generateId("prcrec"),
            usageType: "cached_input_tokens",
            quantity: cachedQty,
            unit: rate.unit,
            rate: rate.price,
            perUnits: rate.perUnits,
            amount: lineCost,
            ruleType: "fixed_model_rate",
            createdAt: new Date(),
          });
        }
      }

      // Reasoning Tokens
      const reasoningQty = effectiveUsage.reasoningTokens !== undefined ? BigInt(effectiveUsage.reasoningTokens) : 0n;
      if (reasoningQty > 0n) {
        const rate = ratesMap.get("reasoning_tokens") ?? ratesMap.get("output_tokens");
        if (rate) {
          let lineCost = Decimal.fromUnits(reasoningQty, rate.price, rate.perUnits);
          lineCost = lineCost.mul(cacheDiscountFactor);
          subtotal = subtotal.add(lineCost);
          lines.push({
            id: generateId("prcln"),
            priceRecordId: generateId("prcrec"),
            usageType: "reasoning_tokens",
            quantity: reasoningQty,
            unit: rate.unit,
            rate: rate.price,
            perUnits: rate.perUnits,
            amount: lineCost,
            ruleType: "fixed_model_rate",
            createdAt: new Date(),
          });
        }
      }
    }

    // Compute Gross Profit and Gross Margin
    // grossProfit = customerPrice - providerCost
    // grossMargin = (customerPrice - providerCost) / customerPrice
    const grossProfit = subtotal.sub(providerCost);
    let grossMargin: Decimal | null = null;
    let marginBasisPoints: bigint | null = null;

    if (subtotal.gt(Decimal.ZERO)) {
      grossMargin = grossProfit.div(subtotal);
      const basisPointsDec = grossMargin.mul(10000).round(0, "HALF_UP");
      marginBasisPoints = basisPointsDec.toBigInt();
    } else if (subtotal.eq(Decimal.ZERO) && providerCost.eq(Decimal.ZERO)) {
      grossMargin = Decimal.ZERO;
      marginBasisPoints = 0n;
    }

    return {
      requestId: params.requestId,
      currency,
      subtotal,
      pricingStatus,
      lines,
      pricingPolicyId: policy.id,
      pricingPolicyVersion: policy.version,
      grossProfit,
      grossMargin,
      marginBasisPoints,
    };
  }
}
