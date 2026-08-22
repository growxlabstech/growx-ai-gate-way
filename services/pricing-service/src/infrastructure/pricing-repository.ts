import type {
  CustomerPolicyWithRates,
  CustomerPriceRecord,
  PricingAdjustmentRecord,
  ProviderCostRecord,
  ProviderScheduleWithRates,
} from "@growx/pricing";

export interface PricingRepository {
  // Provider price schedules
  saveProviderSchedule(schedule: ProviderScheduleWithRates): Promise<void>;
  getProviderSchedule(
    id: string,
  ): Promise<ProviderScheduleWithRates | undefined>;
  listProviderSchedules(filter?: {
    providerId?: string;
    status?: string;
  }): Promise<ProviderScheduleWithRates[]>;

  // Customer pricing policies
  saveCustomerPolicy(policy: CustomerPolicyWithRates): Promise<void>;
  getCustomerPolicy(id: string): Promise<CustomerPolicyWithRates | undefined>;
  listCustomerPolicies(filter?: {
    scopeType?: string;
    scopeId?: string;
    status?: string;
  }): Promise<CustomerPolicyWithRates[]>;

  // Cost records
  saveProviderCostRecord(record: ProviderCostRecord): Promise<void>;
  getProviderCostRecord(
    requestId: string,
  ): Promise<ProviderCostRecord | undefined>;

  // Customer price records
  saveCustomerPriceRecord(record: CustomerPriceRecord): Promise<void>;
  getCustomerPriceRecord(
    requestId: string,
  ): Promise<CustomerPriceRecord | undefined>;

  // Adjustments
  savePricingAdjustment(adjustment: PricingAdjustmentRecord): Promise<void>;
  listPricingAdjustments(requestId: string): Promise<PricingAdjustmentRecord[]>;
}

export class InMemoryPricingRepository implements PricingRepository {
  private readonly providerSchedules: Map<string, ProviderScheduleWithRates> =
    new Map();
  private readonly customerPolicies: Map<string, CustomerPolicyWithRates> =
    new Map();
  private readonly providerCostRecords: Map<string, ProviderCostRecord> =
    new Map();
  private readonly customerPriceRecords: Map<string, CustomerPriceRecord> =
    new Map();
  private readonly adjustments: PricingAdjustmentRecord[] = [];

  public async saveProviderSchedule(
    schedule: ProviderScheduleWithRates,
  ): Promise<void> {
    this.providerSchedules.set(schedule.schedule.id, schedule);
  }

  public async getProviderSchedule(
    id: string,
  ): Promise<ProviderScheduleWithRates | undefined> {
    return this.providerSchedules.get(id);
  }

  public async listProviderSchedules(filter?: {
    providerId?: string;
    status?: string;
  }): Promise<ProviderScheduleWithRates[]> {
    let list = Array.from(this.providerSchedules.values());
    if (filter?.providerId) {
      list = list.filter(
        (s) =>
          s.schedule.providerId.toLowerCase() ===
          filter.providerId!.toLowerCase(),
      );
    }
    if (filter?.status) {
      list = list.filter((s) => s.schedule.status === filter.status);
    }
    return list;
  }

  public async saveCustomerPolicy(
    policy: CustomerPolicyWithRates,
  ): Promise<void> {
    this.customerPolicies.set(policy.policy.id, policy);
  }

  public async getCustomerPolicy(
    id: string,
  ): Promise<CustomerPolicyWithRates | undefined> {
    return this.customerPolicies.get(id);
  }

  public async listCustomerPolicies(filter?: {
    scopeType?: string;
    scopeId?: string;
    status?: string;
  }): Promise<CustomerPolicyWithRates[]> {
    let list = Array.from(this.customerPolicies.values());
    if (filter?.scopeType) {
      list = list.filter((p) => p.policy.scopeType === filter.scopeType);
    }
    if (filter?.scopeId) {
      list = list.filter((p) => p.policy.scopeId === filter.scopeId);
    }
    if (filter?.status) {
      list = list.filter((p) => p.policy.status === filter.status);
    }
    return list;
  }

  public async saveProviderCostRecord(
    record: ProviderCostRecord,
  ): Promise<void> {
    this.providerCostRecords.set(record.requestId, record);
  }

  public async getProviderCostRecord(
    requestId: string,
  ): Promise<ProviderCostRecord | undefined> {
    return this.providerCostRecords.get(requestId);
  }

  public async saveCustomerPriceRecord(
    record: CustomerPriceRecord,
  ): Promise<void> {
    this.customerPriceRecords.set(record.requestId, record);
  }

  public async getCustomerPriceRecord(
    requestId: string,
  ): Promise<CustomerPriceRecord | undefined> {
    return this.customerPriceRecords.get(requestId);
  }

  public async savePricingAdjustment(
    adjustment: PricingAdjustmentRecord,
  ): Promise<void> {
    this.adjustments.push(adjustment);
  }

  public async listPricingAdjustments(
    requestId: string,
  ): Promise<PricingAdjustmentRecord[]> {
    return this.adjustments.filter((a) => a.requestId === requestId);
  }
}
