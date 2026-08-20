export * from "./types.js";
export * from "./provider-price-resolver.js";
export * from "./provider-cost-calculator.js";
export * from "./provider-cost-estimator.js";
export * from "./customer-pricing-resolver.js";
export * from "./customer-price-calculator.js";
export * from "./price-schedule-cache.js";
export * from "./price-reconciliation.js";

// Re-export Money utilities for consumer convenience
export { Decimal, type RoundingMode } from "@growx/money";

// Legacy compatibility helpers (if needed by older stubs)
import { assertSameCurrency, multiplyRatio, type Money } from "@growx/money";

export type PricingLevel = "platform" | "plan" | "organization" | "workspace" | "model" | "promotion";
export interface PricingVersion {
  id: string;
  version: number;
  status: "draft" | "scheduled" | "active" | "superseded" | "archived";
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}
export interface PricingRule {
  id: string;
  versionId: string;
  level: PricingLevel;
  scopeId?: string;
  method: "markup" | "fixed" | "credit_rate";
  markupBasisPoints?: bigint;
  fixedCharge?: Money;
  minimumMarginBasisPoints: bigint;
}

const precedence: readonly PricingLevel[] = ["platform", "plan", "organization", "workspace", "model", "promotion"];
export function selectPricingRule(rules: readonly PricingRule[]): PricingRule {
  const selected = [...rules].sort((a, b) => precedence.indexOf(b.level) - precedence.indexOf(a.level))[0];
  if (!selected) throw new Error("No pricing rule");
  return selected;
}

export interface PriceResult {
  providerCost: Money;
  customerCharge: Money;
  grossMargin: Money;
  grossMarginBasisPoints: bigint;
  pricingVersionId: string;
}

export function calculatePrice(providerCost: Money, rule: PricingRule): PriceResult {
  let customerCharge: Money;
  if (rule.method === "fixed") {
    if (!rule.fixedCharge) throw new Error("Fixed charge missing");
    assertSameCurrency(providerCost, rule.fixedCharge);
    customerCharge = rule.fixedCharge;
  } else {
    const markup = rule.markupBasisPoints ?? 0n;
    customerCharge = {
      amountMinor: providerCost.amountMinor + multiplyRatio(providerCost.amountMinor, markup, 10_000n),
      currency: providerCost.currency,
    };
  }
  const margin = customerCharge.amountMinor - providerCost.amountMinor;
  const marginBasisPoints = customerCharge.amountMinor === 0n ? 0n : (margin * 10_000n) / customerCharge.amountMinor;
  if (marginBasisPoints < rule.minimumMarginBasisPoints) {
    throw Object.assign(new Error("Minimum margin policy violated"), { code: "minimum_margin_violation" });
  }
  return {
    providerCost,
    customerCharge,
    grossMargin: { amountMinor: margin, currency: customerCharge.currency },
    grossMarginBasisPoints: marginBasisPoints,
    pricingVersionId: rule.versionId,
  };
}

export function providerTokenCost(input: {
  inputTokens: bigint;
  outputTokens: bigint;
  cachedTokens: bigint;
  reasoningTokens: bigint;
  inputPerMillion: bigint;
  outputPerMillion: bigint;
  cachedPerMillion: bigint;
  reasoningPerMillion: bigint;
  currency: string;
}): Money {
  const units =
    input.inputTokens * input.inputPerMillion +
    input.outputTokens * input.outputPerMillion +
    input.cachedTokens * input.cachedPerMillion +
    input.reasoningTokens * input.reasoningPerMillion;
  return { amountMinor: (units + 999_999n) / 1_000_000n, currency: input.currency };
}
