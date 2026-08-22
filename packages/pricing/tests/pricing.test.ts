import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  CustomerPriceCalculator,
  CustomerPricingResolver,
  PriceReconciliationEngine,
  ProviderCostCalculator,
  ProviderCostEstimator,
  ProviderPriceResolver,
  type CustomerPolicyWithRates,
  type ProviderScheduleWithRates,
} from "../src/index.js";

describe("Phase 16 — Provider Cost & Pricing Engine", () => {
  const sampleProviderSchedule: ProviderScheduleWithRates = {
    schedule: {
      id: "sched_openai_gpt4o",
      providerId: "openai",
      providerModelId: "gpt-4o",
      canonicalModelId: "gpt-4o",
      region: "global",
      currency: "USD",
      status: "active",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      source: "contract",
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    rates: [
      {
        id: "rate_in",
        scheduleId: "sched_openai_gpt4o",
        usageType: "input_tokens",
        unit: "token",
        price: Decimal.from("5.00"), // $5 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
      {
        id: "rate_out",
        scheduleId: "sched_openai_gpt4o",
        usageType: "output_tokens",
        unit: "token",
        price: Decimal.from("15.00"), // $15 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
      {
        id: "rate_cached",
        scheduleId: "sched_openai_gpt4o",
        usageType: "cached_input_tokens",
        unit: "token",
        price: Decimal.from("2.50"), // $2.50 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
      {
        id: "rate_reasoning",
        scheduleId: "sched_openai_gpt4o",
        usageType: "reasoning_tokens",
        unit: "token",
        price: Decimal.from("15.00"), // $15 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
    ],
  };

  const sampleAnthropicSchedule: ProviderScheduleWithRates = {
    schedule: {
      id: "sched_anthropic_claude",
      providerId: "anthropic",
      providerModelId: "claude-3-5-sonnet",
      canonicalModelId: "claude-3-5-sonnet",
      region: "global",
      currency: "USD",
      status: "active",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      source: "contract",
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    rates: [
      {
        id: "rate_ant_in",
        scheduleId: "sched_anthropic_claude",
        usageType: "input_tokens",
        unit: "token",
        price: Decimal.from("3.00"), // $3 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
      {
        id: "rate_ant_out",
        scheduleId: "sched_anthropic_claude",
        usageType: "output_tokens",
        unit: "token",
        price: Decimal.from("15.00"), // $15 / 1M
        perUnits: 1_000_000n,
        createdAt: new Date(),
      },
    ],
  };

  const sampleCustomerPolicy: CustomerPolicyWithRates = {
    policy: {
      id: "pol_global_fixed",
      scopeType: "global",
      currency: "USD",
      status: "active",
      version: 1,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      pricingModel: "fixed_model_rate",
      cachePricingMode: "discount_percentage",
      cacheDiscountPercentage: Decimal.from("0.50"), // 50% discount on cache hits
      retryOverheadPolicy: "absorbed_by_growx",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    rateSchedules: [
      {
        schedule: {
          id: "crs_gpt4o",
          pricingPolicyId: "pol_global_fixed",
          canonicalModelId: "gpt-4o",
          currency: "USD",
          version: 1,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        rates: [
          {
            id: "crate_in",
            scheduleId: "crs_gpt4o",
            usageType: "input_tokens",
            unit: "token",
            price: Decimal.from("6.00"), // $6 / 1M
            perUnits: 1_000_000n,
            createdAt: new Date(),
          },
          {
            id: "crate_out",
            scheduleId: "crs_gpt4o",
            usageType: "output_tokens",
            unit: "token",
            price: Decimal.from("18.00"), // $18 / 1M
            perUnits: 1_000_000n,
            createdAt: new Date(),
          },
        ],
      },
    ],
  };

  describe("ProviderCostCalculator", () => {
    const resolver = new ProviderPriceResolver([
      sampleProviderSchedule,
      sampleAnthropicSchedule,
    ]);
    const calculator = new ProviderCostCalculator(resolver);

    it("calculates simple provider cost with exact precision", () => {
      // 1,000,000 input tokens at $5/1M + 500,000 output tokens at $15/1M = $5 + $7.50 = $12.50
      const res = calculator.calculateRequestCost({
        requestId: "req_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        attempts: [
          {
            id: "att_1",
            attemptNumber: 1,
            providerId: "openai",
            providerModelId: "gpt-4o",
            status: "completed",
            usageSource: "provider_reported",
            usage: {
              inputTokens: 1_000_000,
              outputTokens: 500_000,
            },
          },
        ],
      });

      expect(res.subtotal.toString()).toBe("12.5");
      expect(res.subtotal.toFixed(2)).toBe("12.50");
      expect(res.costStatus).toBe("exact");
      expect(res.lines.length).toBe(2);
      expect(res.successfulAttemptCost.toString()).toBe("12.5");
      expect(res.retryCost.toString()).toBe("0");
    });

    it("calculates multi-component cost with cached tokens and reasoning tokens", () => {
      // 100,000 input ($0.50) + 50,000 cached ($0.125) + 20,000 output ($0.30) + 10,000 reasoning ($0.15)
      // Total = 0.50 + 0.125 + 0.30 + 0.15 = 1.075
      const res = calculator.calculateRequestCost({
        requestId: "req_2",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        attempts: [
          {
            id: "att_1",
            attemptNumber: 1,
            providerId: "openai",
            providerModelId: "gpt-4o",
            status: "completed",
            usageSource: "provider_reported",
            usage: {
              inputTokens: 100_000,
              outputTokens: 20_000,
              cachedInputTokens: 50_000,
              reasoningTokens: 10_000,
            },
          },
        ],
      });

      expect(res.subtotal.toString()).toBe("1.075");
      expect(res.lines.length).toBe(4);
    });

    it("includes cost of failed provider attempts in request provider total", () => {
      // Attempt 1 fails on OpenAI after consuming 500k input tokens ($2.50)
      // Attempt 2 succeeds on OpenAI with 500k input ($2.50) + 200k output ($3.00) = $5.50
      // Total provider cost = $2.50 + $5.50 = $8.00
      const res = calculator.calculateRequestCost({
        requestId: "req_3",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        attempts: [
          {
            id: "att_1",
            attemptNumber: 1,
            providerId: "openai",
            providerModelId: "gpt-4o",
            status: "failed",
            usageSource: "provider_reported",
            usage: { inputTokens: 500_000, outputTokens: 0 },
          },
          {
            id: "att_2",
            attemptNumber: 2,
            providerId: "openai",
            providerModelId: "gpt-4o",
            status: "completed",
            usageSource: "provider_reported",
            usage: { inputTokens: 500_000, outputTokens: 200_000 },
          },
        ],
      });

      expect(res.subtotal.toString()).toBe("8");
      expect(res.retryCost.toString()).toBe("2.5");
      expect(res.successfulAttemptCost.toString()).toBe("5.5");
      expect(res.lines.length).toBe(3);
    });

    it("correctly prices fallback across different providers with different rate schedules", () => {
      // Attempt 1 fails on OpenAI (100k input @ $5/1M = $0.50)
      // Attempt 2 succeeds on Anthropic (100k input @ $3/1M = $0.30 + 50k output @ $15/1M = $0.75 -> $1.05)
      // Total provider cost = $0.50 + $1.05 = $1.55
      const res = calculator.calculateRequestCost({
        requestId: "req_4",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        attempts: [
          {
            id: "att_1",
            attemptNumber: 1,
            providerId: "openai",
            providerModelId: "gpt-4o",
            status: "failed",
            usageSource: "provider_reported",
            usage: { inputTokens: 100_000, outputTokens: 0 },
          },
          {
            id: "att_2",
            attemptNumber: 2,
            providerId: "anthropic",
            providerModelId: "claude-3-5-sonnet",
            status: "completed",
            usageSource: "provider_reported",
            usage: { inputTokens: 100_000, outputTokens: 50_000 },
          },
        ],
      });

      expect(res.subtotal.toString()).toBe("1.55");
      expect(res.fallbackCost.toString()).toBe("1.05");
      expect(res.retryCost.toString()).toBe("0.5");
    });

    it("returns $0 provider cost and 0 lines on exact cache hit", () => {
      const res = calculator.calculateRequestCost({
        requestId: "req_cache_hit",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        attempts: [],
        executionSource: "cache_exact",
      });

      expect(res.subtotal.isZero()).toBe(true);
      expect(res.lines.length).toBe(0);
      expect(res.costStatus).toBe("exact");
    });

    it("marks costStatus unpriced when price schedule is missing for consumed tokens", () => {
      const res = calculator.calculateRequestCost({
        requestId: "req_missing_sched",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "unknown-model",
        attempts: [
          {
            id: "att_1",
            attemptNumber: 1,
            providerId: "unknown_provider",
            providerModelId: "mystery-model",
            status: "completed",
            usage: { inputTokens: 1000, outputTokens: 500 },
          },
        ],
      });

      expect(res.costStatus).toBe("unpriced");
      expect(res.subtotal.isZero()).toBe(true);
    });
  });

  describe("CustomerPriceCalculator", () => {
    const policyResolver = new CustomerPricingResolver([sampleCustomerPolicy]);
    const calculator = new CustomerPriceCalculator(policyResolver);

    it("calculates fixed canonical model rate independent of upstream provider route", () => {
      // Logical usage: 100,000 input @ $6/1M ($0.60) + 50,000 output @ $18/1M ($0.90) = $1.50
      // Provider cost: $1.00
      // Gross profit = $1.50 - $1.00 = $0.50
      // Gross margin = $0.50 / $1.50 = 33.33% (3333 bps)
      const res = calculator.calculateRequestPrice({
        requestId: "req_cust_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        logicalUsage: {
          inputTokens: 100_000,
          outputTokens: 50_000,
        },
        providerCost: Decimal.from("1.00"),
      });

      expect(res.subtotal.toString()).toBe("1.5");
      expect(res.subtotal.toFixed(2)).toBe("1.50");
      expect(res.grossProfit?.toString()).toBe("0.5");
      expect(res.marginBasisPoints).toBe(3333n);
      expect(res.pricingStatus).toBe("final");
    });

    it("absorbs provider retry overhead by default", () => {
      // Attempt 1 consumed 100k tokens and failed.
      // Attempt 2 consumed 100k input + 50k output and succeeded.
      // Logical usage is 100k in + 50k out ($1.50 customer price).
      // Total provider usage is 200k in + 50k out.
      // Customer is billed ONLY for 100k in + 50k out ($1.50)!
      const res = calculator.calculateRequestPrice({
        requestId: "req_cust_retry",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        logicalUsage: {
          inputTokens: 100_000,
          outputTokens: 50_000,
        },
        totalProviderUsage: {
          inputTokens: 200_000,
          outputTokens: 50_000,
        },
        providerCost: Decimal.from("1.60"),
      });

      expect(res.subtotal.toString()).toBe("1.5");
      expect(res.grossProfit?.toString()).toBe("-0.1"); // GrowX absorbed retry cost, lowering margin
    });

    it("applies cache discount percentage on cache hits", () => {
      // Policy has 50% discount on cache hits.
      // Normal price = $1.50 -> 50% discount = $0.75
      // Provider cost on cache hit = $0.00
      // Gross profit = $0.75, Gross margin = 100% (10000 bps)
      const res = calculator.calculateRequestPrice({
        requestId: "req_cust_cache",
        organizationId: "org_1",
        workspaceId: "ws_1",
        canonicalModelId: "gpt-4o",
        logicalUsage: {
          inputTokens: 100_000,
          outputTokens: 50_000,
        },
        providerCost: Decimal.ZERO,
        executionSource: "cache_exact",
      });

      expect(res.subtotal.toString()).toBe("0.75");
      expect(res.grossProfit?.toString()).toBe("0.75");
      expect(res.marginBasisPoints).toBe(10000n);
    });

    it("supports markup over provider cost policy", () => {
      const markupPolicy: CustomerPolicyWithRates = {
        policy: {
          id: "pol_markup",
          scopeType: "organization",
          scopeId: "org_markup",
          currency: "USD",
          status: "active",
          version: 1,
          effectiveFrom: new Date("2026-01-01"),
          pricingModel: "markup_over_provider_cost",
          markupBasisPoints: 2000n, // 20% markup
          cachePricingMode: "normal",
          retryOverheadPolicy: "absorbed_by_growx",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        rateSchedules: [],
      };

      const customResolver = new CustomerPricingResolver([markupPolicy]);
      const markupCalc = new CustomerPriceCalculator(customResolver);

      // Provider cost = $1.00 -> 20% markup = $1.20 price
      // Gross profit = $1.20 - $1.00 = $0.20
      // Gross margin = $0.20 / $1.20 = 16.67% (1667 bps)
      const res = markupCalc.calculateRequestPrice({
        requestId: "req_markup_1",
        organizationId: "org_markup",
        workspaceId: "ws_1",
        canonicalModelId: "any-model",
        logicalUsage: { inputTokens: 1000, outputTokens: 500 },
        providerCost: Decimal.from("1.00"),
      });

      expect(res.subtotal.toString()).toBe("1.2");
      expect(res.grossProfit?.toString()).toBe("0.2");
      expect(res.marginBasisPoints).toBe(1667n);
    });
  });

  describe("Historical Versioning & Specificity Precedence", () => {
    it("selects correct rate schedule based on effective dating [effectiveFrom, effectiveTo)", () => {
      const oldSchedule: ProviderScheduleWithRates = {
        schedule: {
          id: "sched_gpt4_v1",
          providerId: "openai",
          providerModelId: "gpt-4",
          currency: "USD",
          status: "active",
          effectiveFrom: new Date("2025-01-01T00:00:00Z"),
          effectiveTo: new Date("2026-01-01T00:00:00Z"),
          source: "contract",
          version: 1,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01"),
        },
        rates: [
          {
            id: "r1",
            scheduleId: "sched_gpt4_v1",
            usageType: "input_tokens",
            unit: "token",
            price: Decimal.from("30.00"), // Old price $30/1M
            perUnits: 1_000_000n,
            createdAt: new Date(),
          },
        ],
      };

      const newSchedule: ProviderScheduleWithRates = {
        schedule: {
          id: "sched_gpt4_v2",
          providerId: "openai",
          providerModelId: "gpt-4",
          currency: "USD",
          status: "active",
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          source: "contract",
          version: 2,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
        rates: [
          {
            id: "r2",
            scheduleId: "sched_gpt4_v2",
            usageType: "input_tokens",
            unit: "token",
            price: Decimal.from("10.00"), // New price $10/1M
            perUnits: 1_000_000n,
            createdAt: new Date(),
          },
        ],
      };

      const resolver = new ProviderPriceResolver([oldSchedule, newSchedule]);

      // Request from 2025 resolves v1 ($30/1M)
      const res2025 = resolver.resolveSchedule({
        providerId: "openai",
        providerModelId: "gpt-4",
        targetDate: new Date("2025-06-15T12:00:00Z"),
      });
      expect(res2025?.schedule.id).toBe("sched_gpt4_v1");
      expect(res2025?.rates[0]?.price.toString()).toBe("30");

      // Request from 2026 resolves v2 ($10/1M)
      const res2026 = resolver.resolveSchedule({
        providerId: "openai",
        providerModelId: "gpt-4",
        targetDate: new Date("2026-03-01T12:00:00Z"),
      });
      expect(res2026?.schedule.id).toBe("sched_gpt4_v2");
      expect(res2026?.rates[0]?.price.toString()).toBe("10");
    });
  });

  describe("ProviderCostEstimator for Routing and Policy Engine", () => {
    const resolver = new ProviderPriceResolver([
      sampleProviderSchedule,
      sampleAnthropicSchedule,
    ]);
    const estimator = new ProviderCostEstimator(resolver);

    it("estimates route cost fast and accurately in memory", () => {
      // 1000 input ($0.005) + 500 output ($0.0075) = $0.0125
      const cost = estimator.estimateRouteCost(
        {
          routeId: "route_openai",
          providerId: "openai",
          providerModelId: "gpt-4o",
        },
        { inputTokens: 1000, outputTokens: 500 },
      );

      expect(cost?.toString()).toBe("0.0125");
    });

    it("performs batch estimation across multiple candidates", () => {
      const candidates = [
        {
          routeId: "route_openai",
          providerId: "openai",
          providerModelId: "gpt-4o",
        },
        {
          routeId: "route_anthropic",
          providerId: "anthropic",
          providerModelId: "claude-3-5-sonnet",
        },
      ];

      const batch = estimator.estimateBatch(candidates, {
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(batch.size).toBe(2);

      // OpenAI: 1000 in ($0.005) + 500 out ($0.0075) = $0.0125
      expect(batch.get("route_openai")?.toString()).toBe("0.0125");
      // Anthropic: 1000 in ($0.003) + 500 out ($0.0075) = $0.0105
      expect(batch.get("route_anthropic")?.toString()).toBe("0.0105");

      // Claude is cheaper ($0.0105 < $0.0125) -> lowest_cost routing strategy will choose Anthropic
      expect(batch.get("route_anthropic")!.lt(batch.get("route_openai")!)).toBe(
        true,
      );
    });
  });

  describe("PriceReconciliationEngine", () => {
    const providerResolver = new ProviderPriceResolver([
      sampleProviderSchedule,
    ]);
    const costCalc = new ProviderCostCalculator(providerResolver);
    const customerResolver = new CustomerPricingResolver([
      sampleCustomerPolicy,
    ]);
    const priceCalc = new CustomerPriceCalculator(customerResolver);

    const reconciler = new PriceReconciliationEngine(costCalc, priceCalc);

    it("creates immutable adjustment record when usage is corrected", () => {
      const existingCostRecord = {
        id: "costrec_1",
        requestId: "req_rec_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        currency: "USD",
        subtotal: Decimal.from("10.00"), // Was originally billed for $10
        costStatus: "exact" as const,
        priceVersionSet: ["sched_openai_gpt4o:v1"],
        attemptCount: 1,
        lines: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Corrected usage: 1M input ($5) + 500k output ($7.50) = $12.50
      const { adjustment, newCostSubtotal } =
        reconciler.createProviderCostAdjustment({
          existingCostRecord,
          canonicalModelId: "gpt-4o",
          updatedAttempts: [
            {
              id: "att_1",
              attemptNumber: 1,
              providerId: "openai",
              providerModelId: "gpt-4o",
              status: "completed",
              usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
            },
          ],
          reason: "Late provider stream usage adjustment",
          operatorId: "usr_admin",
        });

      expect(newCostSubtotal.toString()).toBe("12.5");
      expect(adjustment.previousAmount.toString()).toBe("10");
      expect(adjustment.newAmount.toString()).toBe("12.5");
      expect(adjustment.differenceAmount.toString()).toBe("2.5"); // +$2.50 delta
      expect(adjustment.reason).toBe("Late provider stream usage adjustment");
      expect(adjustment.targetType).toBe("provider_cost");
    });
  });
});
