import { Decimal } from "@growx/money";

export type Currency = "USD" | "GBP" | "EUR" | "INR" | (string & {});

export type PriceScheduleStatus = "draft" | "active" | "retired" | "scheduled";

export type PriceSource =
  "manual" | "provider_api" | "contract" | "import" | "sync";

export type UsageType =
  | "input_tokens"
  | "output_tokens"
  | "total_tokens"
  | "cached_input_tokens"
  | "reasoning_tokens"
  | "image_input_units"
  | "image_output_units"
  | "audio_input_seconds"
  | "audio_output_seconds"
  | "video_seconds"
  | "embedding_tokens"
  | "search_calls"
  | "tool_calls"
  | "request";

export type UsageUnit =
  | "token"
  | "unit"
  | "second"
  | "minute"
  | "byte"
  | "request"
  | "call"
  | "operation";

export interface ProviderPriceSchedule {
  id: string;
  providerId: string;
  providerRouteId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerModelId?: string | undefined;
  region?: string | undefined;
  credentialId?: string | undefined;
  currency: Currency;
  status: PriceScheduleStatus;
  effectiveFrom: Date;
  effectiveTo?: Date | null | undefined;
  source: PriceSource;
  sourceReference?: string | undefined;
  version: number;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRate {
  id: string;
  scheduleId: string;
  usageType: UsageType;
  unit: UsageUnit;
  price: Decimal;
  perUnits: bigint;
  minimumCharge?: Decimal | undefined;
  tierStart?: bigint | undefined;
  tierEnd?: bigint | undefined;
  createdAt: Date;
}

export interface ProviderScheduleWithRates {
  schedule: ProviderPriceSchedule;
  rates: ProviderRate[];
}

export type ProviderCostStatus =
  "exact" | "estimated" | "incomplete" | "unpriced" | "reconciled";

export interface ProviderCostLine {
  id: string;
  costRecordId: string;
  requestId: string;
  attemptId?: string | undefined;
  usageEventId?: string | undefined;
  providerId: string;
  providerRouteId?: string | undefined;
  canonicalModelId: string;
  usageType: UsageType;
  quantity: bigint;
  unit: UsageUnit;
  priceScheduleId: string;
  priceVersion: number;
  rate: Decimal;
  perUnits: bigint;
  amount: Decimal;
  currency: Currency;
  source: string;
  createdAt: Date;
}

export interface ProviderCostRecord {
  id: string;
  requestId: string;
  organizationId: string;
  workspaceId: string;
  currency: Currency;
  subtotal: Decimal;
  costStatus: ProviderCostStatus;
  priceVersionSet: string[];
  attemptCount: number;
  lines: ProviderCostLine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCostResult {
  requestId: string;
  currency: Currency;
  subtotal: Decimal;
  costStatus: ProviderCostStatus;
  lines: ProviderCostLine[];
  priceVersionSet: string[];
  retryCost: Decimal;
  fallbackCost: Decimal;
  successfulAttemptCost: Decimal;
}

export type CustomerPolicyScope =
  "global" | "organization" | "workspace" | "plan";

export type CustomerPricingModel =
  "fixed_model_rate" | "markup_over_provider_cost" | "usage_rate" | "hybrid";

export type CachePricingMode =
  "normal" | "discount_percentage" | "separate_rate" | "free";

export type RetryOverheadPolicy =
  "absorbed_by_growx" | "passed_through" | "partially_passed";

export interface CustomerPricingPolicy {
  id: string;
  scopeType: CustomerPolicyScope;
  scopeId?: string | undefined;
  currency: Currency;
  status: "draft" | "active" | "retired";
  version: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null | undefined;
  pricingModel: CustomerPricingModel;
  cachePricingMode: CachePricingMode;
  cacheDiscountPercentage?: Decimal | undefined;
  retryOverheadPolicy: RetryOverheadPolicy;
  markupBasisPoints?: bigint | undefined;
  markupMultiplier?: Decimal | undefined;
  fixedFee?: Decimal | undefined;
  minimumMarginBasisPoints?: bigint | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRateSchedule {
  id: string;
  pricingPolicyId: string;
  canonicalModelId?: string | undefined;
  operation?: string | undefined;
  currency: Currency;
  version: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRate {
  id: string;
  scheduleId: string;
  usageType: UsageType;
  unit: UsageUnit;
  price: Decimal;
  perUnits: bigint;
  minimumCharge?: Decimal | undefined;
  createdAt: Date;
}

export interface CustomerPolicyWithRates {
  policy: CustomerPricingPolicy;
  rateSchedules: Array<{
    schedule: CustomerRateSchedule;
    rates: CustomerRate[];
  }>;
}

export type CustomerPriceStatus =
  "final" | "estimated" | "reconciled" | "unpriced" | "free";

export interface CustomerPriceLine {
  id: string;
  priceRecordId: string;
  usageType: UsageType;
  quantity: bigint;
  unit: UsageUnit;
  rate: Decimal;
  perUnits: bigint;
  amount: Decimal;
  ruleType: string;
  sourceUsageEventId?: string | undefined;
  createdAt: Date;
}

export interface CustomerPriceRecord {
  id: string;
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  pricingPolicyId: string;
  pricingPolicyVersion: number;
  currency: Currency;
  subtotal: Decimal;
  pricingStatus: CustomerPriceStatus;
  executionSource: "live_provider" | "cache_exact" | "synthetic";
  lines: CustomerPriceLine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerPriceResult {
  requestId: string;
  currency: Currency;
  subtotal: Decimal;
  pricingStatus: CustomerPriceStatus;
  lines: CustomerPriceLine[];
  pricingPolicyId: string;
  pricingPolicyVersion: number;
  grossProfit?: Decimal | undefined;
  grossMargin?: Decimal | null | undefined;
  marginBasisPoints?: bigint | null | undefined;
}

export interface PricingAdjustmentRecord {
  id: string;
  requestId: string;
  organizationId: string;
  workspaceId: string;
  targetType: "provider_cost" | "customer_price";
  targetRecordId: string;
  targetLineId?: string | undefined;
  usageReconciliationId?: string | undefined;
  previousAmount: Decimal;
  newAmount: Decimal;
  differenceAmount: Decimal;
  currency: Currency;
  reason: string;
  operatorId: string;
  appliedPriceScheduleId?: string | undefined;
  appliedPriceVersion?: number | undefined;
  createdAt: Date;
}

export interface PriceSimulationRequest {
  canonicalModelId: string;
  providerId?: string | undefined;
  providerRouteId?: string | undefined;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  currency?: Currency | undefined;
}

export interface PriceSimulationResult {
  estimatedProviderCost: Decimal;
  estimatedCustomerPrice: Decimal;
  estimatedGrossProfit: Decimal;
  estimatedGrossMargin: Decimal | null;
  currency: Currency;
  providerScheduleId?: string | undefined;
  providerPriceVersion?: number | undefined;
  customerPolicyId?: string | undefined;
  customerPolicyVersion?: number | undefined;
  costStatus: ProviderCostStatus;
  pricingStatus: CustomerPriceStatus;
}

export interface RequestPricingDetail {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId: string;
  currency: Currency;
  executionSource: string;
  providerCost: Decimal;
  customerPrice: Decimal;
  grossProfit: Decimal;
  grossMargin: Decimal | null;
  marginBasisPoints: bigint | null;
  providerCostStatus: ProviderCostStatus;
  customerPricingStatus: CustomerPriceStatus;
  attemptCosts: Array<{
    attemptId: string;
    attemptNumber: number;
    providerId: string;
    providerModelId: string;
    status: string;
    cost: Decimal;
    lines: ProviderCostLine[];
  }>;
  retryProviderCost: Decimal;
  fallbackProviderCost: Decimal;
  cacheAvoidedProviderCost?: Decimal | undefined;
  calculatedAt: Date;
}
