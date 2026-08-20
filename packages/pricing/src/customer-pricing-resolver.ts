import type {
  Currency,
  CustomerPolicyWithRates,
  CustomerPricingPolicy,
  CustomerRateSchedule,
} from "./types.js";
import { Decimal } from "@growx/money";

export interface ResolveCustomerPolicyParams {
  organizationId: string;
  workspaceId: string;
  policyId?: string | undefined;
  currency?: Currency | undefined;
  targetDate?: Date | undefined;
}

const DEFAULT_GLOBAL_CUSTOMER_POLICY: CustomerPolicyWithRates = {
  policy: {
    id: "pol_default_global",
    scopeType: "global",
    currency: "USD",
    status: "active",
    version: 1,
    effectiveFrom: new Date(0),
    pricingModel: "usage_rate",
    cachePricingMode: "discount_percentage",
    cacheDiscountPercentage: new Decimal("0.8"),
    retryOverheadPolicy: "absorbed_by_growx",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  rateSchedules: [
    {
      schedule: {
        id: "sched_default_global",
        pricingPolicyId: "pol_default_global",
        currency: "USD",
        version: 1,
        effectiveFrom: new Date(0),
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      rates: [
        {
          id: "rate_input_default",
          scheduleId: "sched_default_global",
          usageType: "input_tokens",
          unit: "token",
          price: new Decimal("0.005"),
          perUnits: 1000n,
          createdAt: new Date(0),
        },
        {
          id: "rate_output_default",
          scheduleId: "sched_default_global",
          usageType: "output_tokens",
          unit: "token",
          price: new Decimal("0.015"),
          perUnits: 1000n,
          createdAt: new Date(0),
        },
        {
          id: "rate_cached_default",
          scheduleId: "sched_default_global",
          usageType: "cached_input_tokens",
          unit: "token",
          price: new Decimal("0.001"),
          perUnits: 1000n,
          createdAt: new Date(0),
        },
      ],
    },
  ],
};

export class CustomerPricingResolver {
  private readonly policies: Map<string, CustomerPolicyWithRates> = new Map();

  constructor(initialPolicies?: CustomerPolicyWithRates[]) {
    if (initialPolicies && initialPolicies.length > 0) {
      for (const p of initialPolicies) {
        this.addPolicy(p);
      }
    } else {
      this.addPolicy(DEFAULT_GLOBAL_CUSTOMER_POLICY);
    }
  }

  public addPolicy(item: CustomerPolicyWithRates): void {
    this.validatePolicy(item.policy);
    this.policies.set(item.policy.id, item);
  }

  public removePolicy(policyId: string): void {
    this.policies.delete(policyId);
  }

  public getPolicyById(id: string): CustomerPolicyWithRates | undefined {
    return this.policies.get(id);
  }

  public getAllPolicies(): CustomerPolicyWithRates[] {
    return Array.from(this.policies.values());
  }

  /**
   * Resolves the authoritative customer pricing policy by scope precedence:
   * 1. Exact policyId if specified (for historical versioning)
   * 2. Workspace override
   * 3. Organization policy
   * 4. Global default policy
   */
  public resolvePolicy(params: ResolveCustomerPolicyParams): CustomerPolicyWithRates | undefined {
    const targetDate = params.targetDate ?? new Date();

    if (params.policyId) {
      return this.policies.get(params.policyId);
    }

    const activePolicies = Array.from(this.policies.values())
      .filter((item) => {
        const p = item.policy;
        if (p.status !== "active") {
          return false;
        }
        if (params.currency && p.currency !== params.currency) {
          return false;
        }
        const from = p.effectiveFrom.getTime();
        const to = p.effectiveTo ? p.effectiveTo.getTime() : Infinity;
        const target = targetDate.getTime();
        return target >= from && target < to;
      })
      .sort((a, b) => b.policy.effectiveFrom.getTime() - a.policy.effectiveFrom.getTime());

    // 1. Workspace scope
    const workspacePolicy = activePolicies.find(
      (item) => item.policy.scopeType === "workspace" && item.policy.scopeId === params.workspaceId
    );
    if (workspacePolicy) {
      return workspacePolicy;
    }

    // 2. Organization scope
    const orgPolicy = activePolicies.find(
      (item) => item.policy.scopeType === "organization" && item.policy.scopeId === params.organizationId
    );
    if (orgPolicy) {
      return orgPolicy;
    }

    // 3. Global default
    const globalPolicy = activePolicies.find(
      (item) => item.policy.scopeType === "global"
    );
    if (globalPolicy) {
      return globalPolicy;
    }

    return undefined;
  }

  private validatePolicy(policy: CustomerPricingPolicy): void {
    if (!policy.id || !policy.scopeType) {
      throw new Error("CustomerPricingPolicy must have id and scopeType");
    }
    if (policy.effectiveTo && policy.effectiveTo <= policy.effectiveFrom) {
      throw new Error("effectiveTo must be after effectiveFrom");
    }
    if (policy.version <= 0) {
      throw new Error("CustomerPricingPolicy version must be positive integer");
    }
  }
}
