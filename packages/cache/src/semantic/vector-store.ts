import { cosineSimilarity } from "./embedding-provider.js";
import type {
  SemanticCacheEntry,
  SemanticCandidateMatch,
} from "./types.js";

export interface SemanticVectorQuery {
  organizationId: string;
  workspaceId?: string | undefined;
  namespaceHash?: string | undefined;
  embedding: readonly number[];
  minSimilarity: number;
  limit: number;
}

export interface SemanticInvalidationFilter {
  organizationId: string;
  workspaceId?: string | undefined;
  canonicalModel?: string | undefined;
}

export interface SemanticVectorStore {
  query(params: SemanticVectorQuery): Promise<SemanticCandidateMatch[]>;
  save(entry: SemanticCacheEntry): Promise<void>;
  get(id: string): Promise<SemanticCacheEntry | undefined>;
  update(id: string, updates: Partial<SemanticCacheEntry>): Promise<void>;
  invalidate(filter: SemanticInvalidationFilter): Promise<number>;
  count(organizationId?: string): Promise<number>;
}

export class InMemorySemanticVectorStore implements SemanticVectorStore {
  private readonly entries: Map<string, SemanticCacheEntry> = new Map();

  async save(entry: SemanticCacheEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async get(id: string): Promise<SemanticCacheEntry | undefined> {
    return this.entries.get(id);
  }

  async update(id: string, updates: Partial<SemanticCacheEntry>): Promise<void> {
    const existing = this.entries.get(id);
    if (existing) {
      this.entries.set(id, { ...existing, ...updates });
    }
  }

  async query(params: SemanticVectorQuery): Promise<SemanticCandidateMatch[]> {
    const matches: SemanticCandidateMatch[] = [];
    const now = new Date();

    for (const entry of this.entries.values()) {
      // 1. Mandatory Tenant filter
      if (entry.organizationId !== params.organizationId) {
        continue;
      }

      // 2. Optional workspace filter
      if (params.workspaceId && entry.workspaceId !== params.workspaceId) {
        continue;
      }

      // 3. Optional namespace filter
      if (params.namespaceHash && entry.namespaceHash !== params.namespaceHash) {
        continue;
      }

      // 4. Status and TTL check
      if (entry.status !== "active" || entry.expiresAt <= now) {
        continue;
      }

      // 5. Cosine similarity
      const similarity = cosineSimilarity(params.embedding, entry.embedding);
      if (similarity >= params.minSimilarity) {
        matches.push({ entry, similarity });
      }
    }

    // Sort by highest similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches.slice(0, params.limit);
  }

  async invalidate(filter: SemanticInvalidationFilter): Promise<number> {
    let count = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (entry.organizationId !== filter.organizationId) continue;
      if (filter.workspaceId && entry.workspaceId !== filter.workspaceId) continue;
      if (filter.canonicalModel && entry.canonicalModel !== filter.canonicalModel) continue;

      if (entry.status === "active") {
        this.entries.set(id, { ...entry, status: "invalidated" });
        count++;
      }
    }
    return count;
  }

  async count(organizationId?: string): Promise<number> {
    if (!organizationId) return this.entries.size;
    let c = 0;
    for (const e of this.entries.values()) {
      if (e.organizationId === organizationId && e.status === "active") c++;
    }
    return c;
  }
}
