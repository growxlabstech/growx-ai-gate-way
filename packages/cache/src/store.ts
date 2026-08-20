import type { CacheEntry, InvalidationFilter } from "./types.js";

export interface ExactCacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(entry: CacheEntry, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  invalidate(filter: InvalidationFilter): Promise<number>;
  getStats(): Promise<{ totalEntries: number; totalSizeBytes: number; hitCount: number; missCount: number }>;
  clear(): Promise<void>;
}

export class InMemoryExactCacheStore implements ExactCacheStore {
  private entries: Map<string, { entry: CacheEntry; expiresAtMs: number }> = new Map();
  private stats = { hitCount: 0, missCount: 0 };

  public async get(key: string): Promise<CacheEntry | null> {
    const record = this.entries.get(key);
    if (!record) {
      this.stats.missCount++;
      return null;
    }

    if (Date.now() > record.expiresAtMs) {
      this.entries.delete(key);
      this.stats.missCount++;
      return null;
    }

    this.stats.hitCount++;
    record.entry.hitCount++;
    record.entry.lastAccessedAt = new Date();
    return record.entry;
  }

  public async set(entry: CacheEntry, ttlSeconds: number): Promise<void> {
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    this.entries.set(entry.id, {
      entry: { ...entry, expiresAt: new Date(expiresAtMs) },
      expiresAtMs,
    });
  }

  public async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }

  public async invalidate(filter: InvalidationFilter): Promise<number> {
    let count = 0;
    for (const [key, record] of Array.from(this.entries.entries())) {
      if (record.entry.organizationId !== filter.organizationId) {
        continue;
      }
      if (filter.workspaceId && record.entry.workspaceId !== filter.workspaceId) {
        continue;
      }
      if (filter.canonicalModelId && record.entry.canonicalModelId !== filter.canonicalModelId) {
        continue;
      }
      if (filter.cacheKey && record.entry.id !== filter.cacheKey) {
        continue;
      }
      this.entries.delete(key);
      count++;
    }
    return count;
  }

  public async getStats(): Promise<{ totalEntries: number; totalSizeBytes: number; hitCount: number; missCount: number }> {
    let totalSizeBytes = 0;
    for (const record of this.entries.values()) {
      totalSizeBytes += record.entry.sizeBytes;
    }
    return {
      totalEntries: this.entries.size,
      totalSizeBytes,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
    };
  }

  public async clear(): Promise<void> {
    this.entries.clear();
  }
}
