import { Decimal } from "@growx/money";
import { generateId } from "@growx/ids";
import {
  CustomerPriceCalculator,
  CustomerPricingResolver,
  PriceReconciliationEngine,
  PriceScheduleCache,
  ProviderCostCalculator,
  ProviderCostEstimator,
  ProviderPriceResolver,
  type Currency,
  type CustomerPolicyWithRates,
  type CustomerPriceRecord,
  type CustomerPricingPolicy,
  type CustomerRate,
  type CustomerRateSchedule,
  type PriceSimulationRequest,
  type PriceSimulationResult,
  type PricingAdjustmentRecord,
  type ProviderCostRecord,
  type ProviderRate,
  type ProviderScheduleWithRates,
  type RequestPricingDetail,
  type UsageType,
} from "@growx/pricing";
import type { PricingRepository } from "../infrastructure/pricing-repository.js";

export interface OutboxEventEmitter {
  emit(
    topic: string,
    payload: Record<string, unknown>,
    orgId?: string,
    wsId?: string,
  ): Promise<void>;
}

export interface PricingServiceOptions {
  repository: PricingRepository;
  outbox?: OutboxEventEmitter | undefined;
  cacheTtlMs?: number | undefined;
}

export interface PriceRequestParams {
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
  currency?: Currency | undefined;
  targetDate?: Date | undefined;
}

export class PricingService {
  private readonly repository: PricingRepository;
  private readonly outbox?: OutboxEventEmitter | undefined;

  private readonly providerPriceResolver: ProviderPriceResolver;
  private readonly providerCostCalculator: ProviderCostCalculator;
  private readonly providerCostEstimator: ProviderCostEstimator;

  private readonly customerPricingResolver: CustomerPricingResolver;
  private readonly customerPriceCalculator: CustomerPriceCalculator;
  private readonly reconciliationEngine: PriceReconciliationEngine;
  private readonly scheduleCache: PriceScheduleCache;

  constructor(options: PricingServiceOptions) {
    this.repository = options.repository;
    this.outbox = options.outbox;

    this.providerPriceResolver = new ProviderPriceResolver();
    this.providerCostCalculator = new ProviderCostCalculator(
      this.providerPriceResolver,
    );
    this.providerCostEstimator = new ProviderCostEstimator(
      this.providerPriceResolver,
    );

    this.customerPricingResolver = new CustomerPricingResolver();
    this.customerPriceCalculator = new CustomerPriceCalculator(
      this.customerPricingResolver,
    );
    this.reconciliationEngine = new PriceReconciliationEngine(
      this.providerCostCalculator,
      this.customerPriceCalculator,
    );
    this.scheduleCache = new PriceScheduleCache({ ttlMs: options.cacheTtlMs });
  }

  public getEstimator(): ProviderCostEstimator {
    return this.providerCostEstimator;
  }

  public getProviderResolver(): ProviderPriceResolver {
    return this.providerPriceResolver;
  }

  public getCustomerResolver(): CustomerPricingResolver {
    return this.customerPricingResolver;
  }

  /**
   * Initializes resolvers from repository data.
   */
  public async initialize(): Promise<void> {
    const providerSchedules = await this.repository.listProviderSchedules({
      status: "active",
    });
    for (const sched of providerSchedules) {
      this.providerPriceResolver.addSchedule(sched);
      this.scheduleCache.setProviderSchedule(sched.schedule.id, sched);
    }

    const customerPolicies = await this.repository.listCustomerPolicies({
      status: "active",
    });
    for (const pol of customerPolicies) {
      this.customerPricingResolver.addPolicy(pol);
      this.scheduleCache.setCustomerPolicy(pol.policy.id, pol);
    }
  }

  // =========================================================================
  // PROVIDER PRICE SCHEDULE MANAGEMENT
  // =========================================================================

  public async createProviderSchedule(params: {
    providerId: string;
    providerRouteId?: string | undefined;
    canonicalModelId?: string | undefined;
    providerModelId?: string | undefined;
    region?: string | undefined;
    credentialId?: string | undefined;
    currency?: Currency | undefined;
    effectiveFrom?: Date | undefined;
    effectiveTo?: Date | null | undefined;
    source?:
      "manual" | "provider_api" | "contract" | "import" | "sync" | undefined;
    sourceReference?: string | undefined;
    rates: Array<{
      usageType: UsageType;
      unit?: string | undefined;
      price: string | number | Decimal;
      perUnits?: number | bigint | undefined;
      minimumCharge?: string | undefined;
    }>;
  }): Promise<ProviderScheduleWithRates> {
    const scheduleId = generateId("psched");
    const now = new Date();

    const schedule: ProviderScheduleWithRates = {
      schedule: {
        id: scheduleId,
        providerId: params.providerId,
        providerRouteId: params.providerRouteId,
        canonicalModelId: params.canonicalModelId,
        providerModelId: params.providerModelId,
        region: params.region ?? "global",
        credentialId: params.credentialId,
        currency: params.currency ?? "USD",
        status: "active",
        effectiveFrom: params.effectiveFrom ?? now,
        effectiveTo: params.effectiveTo,
        source: params.source ?? "contract",
        sourceReference: params.sourceReference,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      rates: params.rates.map((r) => ({
        id: generateId("prate"),
        scheduleId,
        usageType: r.usageType,
        unit: (r.unit ?? "token") as any,
        price: Decimal.from(r.price),
        perUnits: BigInt(r.perUnits ?? 1_000_000n),
        minimumCharge: r.minimumCharge
          ? Decimal.from(r.minimumCharge)
          : undefined,
        createdAt: now,
      })),
    };

    await this.repository.saveProviderSchedule(schedule);
    this.providerPriceResolver.addSchedule(schedule);
    this.scheduleCache.invalidateProvider(params.providerId);

    if (this.outbox) {
      await this.outbox.emit("pricing.schedule_updated.v1", {
        scheduleId: schedule.schedule.id,
        providerId: schedule.schedule.providerId,
        version: schedule.schedule.version,
        action: "created",
      });
    }

    return schedule;
  }

  public async getProviderSchedule(
    id: string,
  ): Promise<ProviderScheduleWithRates | undefined> {
    return this.repository.getProviderSchedule(id);
  }

  public async listProviderSchedules(filter?: {
    providerId?: string;
    status?: string;
  }): Promise<ProviderScheduleWithRates[]> {
    return this.repository.listProviderSchedules(filter);
  }

  public async retireProviderSchedule(
    id: string,
  ): Promise<ProviderScheduleWithRates> {
    const existing = await this.repository.getProviderSchedule(id);
    if (!existing) {
      throw new Error(`Provider price schedule ${id} not found`);
    }

    existing.schedule.status = "retired";
    existing.schedule.effectiveTo = new Date();
    existing.schedule.updatedAt = new Date();

    await this.repository.saveProviderSchedule(existing);
    this.providerPriceResolver.removeSchedule(id);
    this.scheduleCache.invalidateProvider(existing.schedule.providerId);

    if (this.outbox) {
      await this.outbox.emit("pricing.schedule_updated.v1", {
        scheduleId: existing.schedule.id,
        providerId: existing.schedule.providerId,
        version: existing.schedule.version,
        action: "retired",
      });
    }

    return existing;
  }

  // =========================================================================
  // CUSTOMER PRICING POLICY MANAGEMENT
  // =========================================================================

  public async createCustomerPolicy(params: {
    scopeType?: "global" | "organization" | "workspace" | "plan" | undefined;
    scopeId?: string | undefined;
    currency?: Currency | undefined;
    pricingModel?:
      | "fixed_model_rate"
      | "markup_over_provider_cost"
      | "usage_rate"
      | "hybrid"
      | undefined;
    cachePricingMode?:
      "normal" | "discount_percentage" | "separate_rate" | "free" | undefined;
    cacheDiscountPercentage?: string | number | Decimal | undefined;
    retryOverheadPolicy?:
      "absorbed_by_growx" | "passed_through" | "partially_passed" | undefined;
    markupBasisPoints?: bigint | number | undefined;
    markupMultiplier?: string | number | Decimal | undefined;
    fixedFee?: string | number | Decimal | undefined;
    minimumMarginBasisPoints?: bigint | number | undefined;
    rateSchedules?:
      | Array<{
          canonicalModelId?: string | undefined;
          operation?: string | undefined;
          rates: Array<{
            usageType: UsageType;
            unit?: string | undefined;
            price: string | number | Decimal;
            perUnits?: number | bigint | undefined;
          }>;
        }>
      | undefined;
  }): Promise<CustomerPolicyWithRates> {
    const policyId = generateId("cpol");
    const now = new Date();

    const policyWithRates: CustomerPolicyWithRates = {
      policy: {
        id: policyId,
        scopeType: params.scopeType ?? "global",
        scopeId: params.scopeId,
        currency: params.currency ?? "USD",
        status: "active",
        version: 1,
        effectiveFrom: now,
        pricingModel: params.pricingModel ?? "fixed_model_rate",
        cachePricingMode: params.cachePricingMode ?? "discount_percentage",
        cacheDiscountPercentage: params.cacheDiscountPercentage
          ? Decimal.from(params.cacheDiscountPercentage)
          : undefined,
        retryOverheadPolicy: params.retryOverheadPolicy ?? "absorbed_by_growx",
        markupBasisPoints:
          params.markupBasisPoints !== undefined
            ? BigInt(params.markupBasisPoints)
            : undefined,
        markupMultiplier: params.markupMultiplier
          ? Decimal.from(params.markupMultiplier)
          : undefined,
        fixedFee: params.fixedFee ? Decimal.from(params.fixedFee) : undefined,
        minimumMarginBasisPoints:
          params.minimumMarginBasisPoints !== undefined
            ? BigInt(params.minimumMarginBasisPoints)
            : undefined,
        createdAt: now,
        updatedAt: now,
      },
      rateSchedules: (params.rateSchedules ?? []).map((rs) => {
        const scheduleId = generateId("crsched");
        return {
          schedule: {
            id: scheduleId,
            pricingPolicyId: policyId,
            canonicalModelId: rs.canonicalModelId,
            operation: rs.operation,
            currency: params.currency ?? "USD",
            version: 1,
            effectiveFrom: now,
            createdAt: now,
            updatedAt: now,
          },
          rates: rs.rates.map((r) => ({
            id: generateId("crate"),
            scheduleId,
            usageType: r.usageType,
            unit: (r.unit ?? "token") as any,
            price: Decimal.from(r.price),
            perUnits: BigInt(r.perUnits ?? 1_000_000n),
            createdAt: now,
          })),
        };
      }),
    };

    await this.repository.saveCustomerPolicy(policyWithRates);
    this.customerPricingResolver.addPolicy(policyWithRates);
    this.scheduleCache.invalidateCustomerPolicy(params.scopeId);

    if (this.outbox) {
      await this.outbox.emit("pricing.policy_updated.v1", {
        policyId: policyWithRates.policy.id,
        scopeType: policyWithRates.policy.scopeType,
        scopeId: policyWithRates.policy.scopeId,
        action: "created",
      });
    }

    return policyWithRates;
  }

  public async getCustomerPolicy(
    id: string,
  ): Promise<CustomerPolicyWithRates | undefined> {
    return this.repository.getCustomerPolicy(id);
  }

  public async listCustomerPolicies(filter?: {
    scopeType?: string;
    scopeId?: string;
    status?: string;
  }): Promise<CustomerPolicyWithRates[]> {
    return this.repository.listCustomerPolicies(filter);
  }

  // =========================================================================
  // SIMULATION & ESTIMATION
  // =========================================================================

  public async simulatePrice(
    request: PriceSimulationRequest,
  ): Promise<PriceSimulationResult> {
    const currency = request.currency ?? "USD";

    // 1. Estimate provider cost
    const providerRouteCost = this.providerCostEstimator.estimateRouteCost(
      {
        routeId: request.providerRouteId ?? "simulated_route",
        providerId: request.providerId ?? "openai",
        providerModelId: request.canonicalModelId,
        canonicalModelId: request.canonicalModelId,
      },
      {
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        cachedInputTokens: request.cachedInputTokens,
        reasoningTokens: request.reasoningTokens,
      },
      currency,
    );

    const estimatedProviderCost = providerRouteCost ?? Decimal.ZERO;

    // 2. Estimate customer price
    const customerPriceResult =
      this.customerPriceCalculator.calculateRequestPrice({
        requestId: "simulated_request",
        organizationId: request.organizationId ?? "org_sim",
        workspaceId: request.workspaceId ?? "ws_sim",
        canonicalModelId: request.canonicalModelId,
        logicalUsage: {
          inputTokens: request.inputTokens,
          outputTokens: request.outputTokens,
          cachedInputTokens: request.cachedInputTokens,
          reasoningTokens: request.reasoningTokens,
        },
        providerCost: estimatedProviderCost,
        currency,
      });

    return {
      estimatedProviderCost,
      estimatedCustomerPrice: customerPriceResult.subtotal,
      estimatedGrossProfit:
        customerPriceResult.grossProfit ??
        customerPriceResult.subtotal.sub(estimatedProviderCost),
      estimatedGrossMargin: customerPriceResult.grossMargin ?? null,
      currency,
      costStatus: providerRouteCost ? "exact" : "unpriced",
      pricingStatus: customerPriceResult.pricingStatus,
      customerPolicyId: customerPriceResult.pricingPolicyId,
      customerPolicyVersion: customerPriceResult.pricingPolicyVersion,
    };
  }

  // =========================================================================
  // AUTHORITATIVE REQUEST PRICING & PERSISTENCE
  // =========================================================================

  public async priceRequest(
    params: PriceRequestParams,
  ): Promise<RequestPricingDetail> {
    const currency = params.currency ?? "USD";

    // 1. Calculate Authoritative Provider Cost across all attempts
    const providerCostResult = this.providerCostCalculator.calculateRequestCost(
      {
        requestId: params.requestId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        canonicalModelId: params.canonicalModelId,
        attempts: params.attempts,
        executionSource: params.executionSource,
        currency,
        targetDate: params.targetDate,
      },
    );

    const providerCostRecord: ProviderCostRecord = {
      id: generateId("costrec"),
      requestId: params.requestId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      currency,
      subtotal: providerCostResult.subtotal,
      costStatus: providerCostResult.costStatus,
      priceVersionSet: providerCostResult.priceVersionSet,
      attemptCount: params.attempts.length,
      lines: providerCostResult.lines,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repository.saveProviderCostRecord(providerCostRecord);

    // 2. Calculate Authoritative Customer Price on Logical Usage
    const totalProviderUsage = params.attempts.reduce(
      (acc, att) => ({
        inputTokens: BigInt(acc.inputTokens) + BigInt(att.usage.inputTokens),
        outputTokens: BigInt(acc.outputTokens) + BigInt(att.usage.outputTokens),
        cachedInputTokens:
          BigInt(acc.cachedInputTokens) +
          BigInt(att.usage.cachedInputTokens ?? 0),
        reasoningTokens:
          BigInt(acc.reasoningTokens) + BigInt(att.usage.reasoningTokens ?? 0),
      }),
      {
        inputTokens: 0n,
        outputTokens: 0n,
        cachedInputTokens: 0n,
        reasoningTokens: 0n,
      },
    );

    const customerPriceResult =
      this.customerPriceCalculator.calculateRequestPrice({
        requestId: params.requestId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        apiKeyId: params.apiKeyId,
        canonicalModelId: params.canonicalModelId,
        logicalUsage: params.logicalUsage,
        totalProviderUsage,
        providerCost: providerCostResult.subtotal,
        executionSource: params.executionSource,
        policyId: params.policyId,
        currency,
        targetDate: params.targetDate,
      });

    const customerPriceRecord: CustomerPriceRecord = {
      id: generateId("prcrec"),
      requestId: params.requestId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      pricingPolicyId: customerPriceResult.pricingPolicyId,
      pricingPolicyVersion: customerPriceResult.pricingPolicyVersion,
      currency,
      subtotal: customerPriceResult.subtotal,
      pricingStatus: customerPriceResult.pricingStatus,
      executionSource: params.executionSource ?? "live_provider",
      lines: customerPriceResult.lines,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repository.saveCustomerPriceRecord(customerPriceRecord);

    // 3. Emit Outbox Event
    if (this.outbox) {
      await this.outbox.emit(
        "pricing.calculated.v1",
        {
          requestId: params.requestId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          apiKeyId: params.apiKeyId,
          canonicalModelId: params.canonicalModelId,
          executionSource: params.executionSource ?? "live_provider",
          providerCost: providerCostResult.subtotal.toString(),
          customerPrice: customerPriceResult.subtotal.toString(),
          grossProfit: (
            customerPriceResult.grossProfit ?? Decimal.ZERO
          ).toString(),
          grossMargin: customerPriceResult.grossMargin
            ? customerPriceResult.grossMargin.toString()
            : null,
          marginBasisPoints:
            customerPriceResult.marginBasisPoints !== null &&
            customerPriceResult.marginBasisPoints !== undefined
              ? customerPriceResult.marginBasisPoints.toString()
              : null,
          currency,
          costStatus: providerCostResult.costStatus,
          pricingStatus: customerPriceResult.pricingStatus,
        },
        params.organizationId,
        params.workspaceId,
      );
    }

    // Attempt breakdown
    const attemptCosts = params.attempts.map((att) => {
      const attemptLines = providerCostResult.lines.filter(
        (l) => l.attemptId === att.id,
      );
      const attemptCost = attemptLines.reduce(
        (acc, l) => acc.add(l.amount),
        Decimal.ZERO,
      );
      return {
        attemptId: att.id,
        attemptNumber: att.attemptNumber,
        providerId: att.providerId,
        providerModelId: att.providerModelId,
        status: att.status,
        cost: attemptCost,
        lines: attemptLines,
      };
    });

    return {
      requestId: params.requestId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      currency,
      executionSource: params.executionSource ?? "live_provider",
      providerCost: providerCostResult.subtotal,
      customerPrice: customerPriceResult.subtotal,
      grossProfit:
        customerPriceResult.grossProfit ??
        customerPriceResult.subtotal.sub(providerCostResult.subtotal),
      grossMargin: customerPriceResult.grossMargin ?? null,
      marginBasisPoints: customerPriceResult.marginBasisPoints ?? null,
      providerCostStatus: providerCostResult.costStatus,
      customerPricingStatus: customerPriceResult.pricingStatus,
      attemptCosts,
      retryProviderCost: providerCostResult.retryCost,
      fallbackProviderCost: providerCostResult.fallbackCost,
      cacheAvoidedProviderCost:
        params.executionSource === "cache_exact" ? Decimal.ZERO : undefined,
      calculatedAt: new Date(),
    };
  }

  public async getRequestPricing(
    requestId: string,
  ): Promise<RequestPricingDetail | undefined> {
    const costRecord = await this.repository.getProviderCostRecord(requestId);
    const priceRecord = await this.repository.getCustomerPriceRecord(requestId);

    if (!costRecord && !priceRecord) {
      return undefined;
    }

    const providerCost = costRecord ? costRecord.subtotal : Decimal.ZERO;
    const customerPrice = priceRecord ? priceRecord.subtotal : Decimal.ZERO;
    const grossProfit = customerPrice.sub(providerCost);
    let grossMargin: Decimal | null = null;
    let marginBasisPoints: bigint | null = null;

    if (customerPrice.gt(Decimal.ZERO)) {
      grossMargin = grossProfit.div(customerPrice);
      marginBasisPoints = grossMargin.mul(10000).round(0, "HALF_UP").toBigInt();
    }

    return {
      requestId,
      organizationId:
        costRecord?.organizationId ?? priceRecord?.organizationId ?? "",
      workspaceId: costRecord?.workspaceId ?? priceRecord?.workspaceId ?? "",
      apiKeyId: priceRecord?.apiKeyId,
      canonicalModelId: costRecord?.lines[0]?.canonicalModelId ?? "",
      currency: costRecord?.currency ?? priceRecord?.currency ?? "USD",
      executionSource: priceRecord?.executionSource ?? "live_provider",
      providerCost,
      customerPrice,
      grossProfit,
      grossMargin,
      marginBasisPoints,
      providerCostStatus: costRecord?.costStatus ?? "unpriced",
      customerPricingStatus: priceRecord?.pricingStatus ?? "unpriced",
      attemptCosts: [],
      retryProviderCost: Decimal.ZERO,
      fallbackProviderCost: Decimal.ZERO,
      calculatedAt:
        costRecord?.createdAt ?? priceRecord?.createdAt ?? new Date(),
    };
  }
}
