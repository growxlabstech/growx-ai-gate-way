import type { EffectivePolicy } from "./types.js";

export interface IPolicyCache {
  get(key: string): Promise<EffectivePolicy | null>;
  set(key: string, policy: EffectivePolicy, ttlSeconds?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidateOrganization(organizationId: string): Promise<void>;
  invalidateWorkspace(workspaceId: string): Promise<void>;
  invalidateApiKey(apiKeyId: string): Promise<void>;
  invalidateGlobal(): Promise<void>;
  getMetrics(): { hits: number; misses: number; entries: number };
}

interface CacheEntry {
  policy: EffectivePolicy;
  expiresAt: number;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
}

export class InMemoryPolicyCache implements IPolicyCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(options?: { defaultTtlSeconds?: number }) {
    this.defaultTtlMs = (options?.defaultTtlSeconds ?? 60) * 1000;
  }

  async get(key: string): Promise<EffectivePolicy | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.policy;
  }

  async set(key: string, policy: EffectivePolicy, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;
    const [organizationId, workspaceId, apiKeyId] = key.split(":");

    this.entries.set(key, {
      policy,
      expiresAt: Date.now() + ttlMs,
      organizationId: organizationId ?? "",
      workspaceId: workspaceId ?? "",
      apiKeyId: apiKeyId && apiKeyId !== "none" ? apiKeyId : undefined,
    });
  }

  async invalidate(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async invalidateOrganization(organizationId: string): Promise<void> {
    for (const [k, entry] of this.entries.entries()) {
      if (entry.organizationId === organizationId) {
        this.entries.delete(k);
      }
    }
  }

  async invalidateWorkspace(workspaceId: string): Promise<void> {
    for (const [k, entry] of this.entries.entries()) {
      if (entry.workspaceId === workspaceId) {
        this.entries.delete(k);
      }
    }
  }

  async invalidateApiKey(apiKeyId: string): Promise<void> {
    for (const [k, entry] of this.entries.entries()) {
      if (entry.apiKeyId === apiKeyId) {
        this.entries.delete(k);
      }
    }
  }

  async invalidateGlobal(): Promise<void> {
    this.entries.clear();
  }

  getMetrics(): { hits: number; misses: number; entries: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.entries.size,
    };
  }
}
