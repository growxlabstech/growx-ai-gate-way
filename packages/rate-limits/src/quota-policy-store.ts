import { randomUUID } from "node:crypto";
import type { QuotaLimit, QuotaScopeType } from "./types.js";

export interface IQuotaPolicyRepository {
  getLimitsForScope(
    scopeType: QuotaScopeType,
    scopeId: string
  ): Promise<QuotaLimit[]>;

  getLimitsForScopes(
    scopes: Array<{ scopeType: QuotaScopeType; scopeId: string }>
  ): Promise<Map<string, QuotaLimit[]>>;

  saveLimit(limit: Omit<QuotaLimit, "id"> & { id?: string }): Promise<QuotaLimit>;
  deleteLimit(id: string): Promise<boolean>;
  listPolicies(scopeType?: QuotaScopeType): Promise<QuotaLimit[]>;
}

export class InMemoryQuotaPolicyRepository implements IQuotaPolicyRepository {
  private readonly limits = new Map<string, QuotaLimit>();

  constructor(initialLimits: QuotaLimit[] = []) {
    for (const l of initialLimits) {
      const id = l.id ?? `qlim_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      this.limits.set(id, { ...l, id });
    }
  }

  private scopeKey(scopeType: QuotaScopeType, scopeId: string): string {
    return `${scopeType}:${scopeId}`;
  }

  async getLimitsForScope(
    scopeType: QuotaScopeType,
    scopeId: string
  ): Promise<QuotaLimit[]> {
    const result: QuotaLimit[] = [];
    for (const limit of this.limits.values()) {
      if (limit.scopeType === scopeType && limit.scopeId === scopeId && limit.enabled) {
        result.push({ ...limit });
      }
    }
    return result;
  }

  async getLimitsForScopes(
    scopes: Array<{ scopeType: QuotaScopeType; scopeId: string }>
  ): Promise<Map<string, QuotaLimit[]>> {
    const map = new Map<string, QuotaLimit[]>();
    for (const s of scopes) {
      const key = this.scopeKey(s.scopeType, s.scopeId);
      const limits = await this.getLimitsForScope(s.scopeType, s.scopeId);
      map.set(key, limits);
    }
    return map;
  }

  async saveLimit(
    limitInput: Omit<QuotaLimit, "id"> & { id?: string }
  ): Promise<QuotaLimit> {
    const id = limitInput.id ?? `qlim_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const limit: QuotaLimit = {
      ...limitInput,
      id,
      version: (limitInput.version ?? 0) + 1,
    };
    this.limits.set(id, limit);
    return { ...limit };
  }

  async deleteLimit(id: string): Promise<boolean> {
    return this.limits.delete(id);
  }

  async listPolicies(scopeType?: QuotaScopeType): Promise<QuotaLimit[]> {
    const results: QuotaLimit[] = [];
    for (const l of this.limits.values()) {
      if (!scopeType || l.scopeType === scopeType) {
        results.push({ ...l });
      }
    }
    return results;
  }
}
