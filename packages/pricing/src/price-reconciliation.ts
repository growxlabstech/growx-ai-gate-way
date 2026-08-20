import { Decimal } from "@growx/money";
import { generateId } from "@growx/ids";
import type {
  Currency,
  CustomerPriceRecord,
  PricingAdjustmentRecord,
  ProviderCostRecord,
} from "./types.js";
import { ProviderCostCalculator } from "./provider-cost-calculator.js";
import { CustomerPriceCalculator } from "./customer-price-calculator.js";

export interface ReconcileProviderCostParams {
  existingCostRecord: ProviderCostRecord;
  updatedAttempts: Parameters<ProviderCostCalculator["calculateRequestCost"]>[0]["attempts"];
  canonicalModelId: string;
  reason: string;
  operatorId: string;
  usageReconciliationId?: string | undefined;
}

export interface ReconcileCustomerPriceParams {
  existingPriceRecord: CustomerPriceRecord;
  updatedLogicalUsage: Parameters<CustomerPriceCalculator["calculateRequestPrice"]>[0]["logicalUsage"];
  canonicalModelId: string;
  updatedProviderCost: Decimal;
  reason: string;
  operatorId: string;
  usageReconciliationId?: string | undefined;
}

export class PriceReconciliationEngine {
  private readonly costCalculator: ProviderCostCalculator;
  private readonly priceCalculator: CustomerPriceCalculator;

  constructor(
    costCalculator: ProviderCostCalculator,
    priceCalculator: CustomerPriceCalculator
  ) {
    this.costCalculator = costCalculator;
    this.priceCalculator = priceCalculator;
  }

  public createProviderCostAdjustment(
    params: ReconcileProviderCostParams
  ): {
    adjustment: PricingAdjustmentRecord;
    newCostSubtotal: Decimal;
  } {
    const existing = params.existingCostRecord;

    const recalculated = this.costCalculator.calculateRequestCost({
      requestId: existing.requestId,
      organizationId: existing.organizationId,
      workspaceId: existing.workspaceId,
      canonicalModelId: params.canonicalModelId,
      attempts: params.updatedAttempts,
      currency: existing.currency,
    });

    const previousAmount = existing.subtotal;
    const newAmount = recalculated.subtotal;
    const differenceAmount = newAmount.sub(previousAmount);

    const adjustment: PricingAdjustmentRecord = {
      id: generateId("prcadj"),
      requestId: existing.requestId,
      organizationId: existing.organizationId,
      workspaceId: existing.workspaceId,
      targetType: "provider_cost",
      targetRecordId: existing.id,
      usageReconciliationId: params.usageReconciliationId,
      previousAmount,
      newAmount,
      differenceAmount,
      currency: existing.currency,
      reason: params.reason,
      operatorId: params.operatorId,
      createdAt: new Date(),
    };

    return {
      adjustment,
      newCostSubtotal: newAmount,
    };
  }

  public createCustomerPriceAdjustment(
    params: ReconcileCustomerPriceParams
  ): {
    adjustment: PricingAdjustmentRecord;
    newPriceSubtotal: Decimal;
  } {
    const existing = params.existingPriceRecord;

    const recalculated = this.priceCalculator.calculateRequestPrice({
      requestId: existing.requestId,
      organizationId: existing.organizationId,
      workspaceId: existing.workspaceId,
      apiKeyId: existing.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      logicalUsage: params.updatedLogicalUsage,
      providerCost: params.updatedProviderCost,
      policyId: existing.pricingPolicyId,
      currency: existing.currency,
      executionSource: existing.executionSource,
    });

    const previousAmount = existing.subtotal;
    const newAmount = recalculated.subtotal;
    const differenceAmount = newAmount.sub(previousAmount);

    const adjustment: PricingAdjustmentRecord = {
      id: generateId("prcadj"),
      requestId: existing.requestId,
      organizationId: existing.organizationId,
      workspaceId: existing.workspaceId,
      targetType: "customer_price",
      targetRecordId: existing.id,
      usageReconciliationId: params.usageReconciliationId,
      previousAmount,
      newAmount,
      differenceAmount,
      currency: existing.currency,
      reason: params.reason,
      operatorId: params.operatorId,
      appliedPriceScheduleId: existing.pricingPolicyId,
      appliedPriceVersion: existing.pricingPolicyVersion,
      createdAt: new Date(),
    };

    return {
      adjustment,
      newPriceSubtotal: newAmount,
    };
  }
}
