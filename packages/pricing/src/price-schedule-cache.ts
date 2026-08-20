import type {
  CustomerPolicyWithRates,
  ProviderScheduleWithRates,
} from "./types.js";

export interface PriceCacheMetrics {
  hits: number;
  misses: number;
}

export interface PriceScheduleCacheOptions {
  ttlMs?: number | undefined;
  maxEntries?: number | undefined;
}

export class PriceScheduleCache {
  private readonly providerCache: Map<string, { value: ProviderScheduleWithRates; expiresAt: number }> = new Map();
  private readonly policyCache: Map<string, { value: CustomerPolicyWithRates; expiresAt: number }> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  private hitCount = 0;
  private missCount = 0;

  constructor(options: PriceScheduleCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60_000; // Default 1 minute safe TTL
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  public getProviderSchedule(key: string): ProviderScheduleWithRates | undefined {
    const entry = this.providerCache.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.providerCache.delete(key);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    return entry.value;
  }

  public setProviderSchedule(key: string, schedule: ProviderScheduleWithRates): void {
    if (this.providerCache.size >= this.maxEntries) {
      const oldestKey = this.providerCache.keys().next().value;
      if (oldestKey) this.providerCache.delete(oldestKey);
    }

    this.providerCache.set(key, {
      value: schedule,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  public getCustomerPolicy(key: string): CustomerPolicyWithRates | undefined {
    const entry = this.policyCache.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.policyCache.delete(key);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    return entry.value;
  }

  public setCustomerPolicy(key: string, policy: CustomerPolicyWithRates): void {
    if (this.policyCache.size >= this.maxEntries) {
      const oldestKey = this.policyCache.keys().next().value;
      if (oldestKey) this.policyCache.delete(oldestKey);
    }

    this.policyCache.set(key, {
      value: policy,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  public invalidateProvider(providerId?: string): void {
    if (!providerId) {
      this.providerCache.clear();
      return;
    }
    for (const [k, v] of this.providerCache.entries()) {
      if (v.value.schedule.providerId.toLowerCase() === providerId.toLowerCase()) {
        this.providerCache.delete(k);
      }
    }
  }

  public invalidateCustomerPolicy(scopeId?: string): void {
    if (!scopeId) {
      this.policyCache.clear();
      return;
    }
    for (const [k, v] of this.policyCache.entries()) {
      if (v.value.policy.scopeId === scopeId || v.value.policy.id === scopeId) {
        this.policyCache.delete(k);
      }
    }
  }

  public clear(): void {
    this.providerCache.clear();
    this.policyCache.clear();
  }

  public getMetrics(): PriceCacheMetrics {
    return {
      hits: this.hitCount,
      misses: this.missCount,
    };
  }
}
