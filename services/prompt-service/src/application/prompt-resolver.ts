import type {
  PromptDefinition,
  PromptVersion,
  PromptReleaseHead,
  PromptReleaseEnvironment,
} from "@growx/contracts";
import { PromptNotFoundError, PromptReleaseError } from "@growx/prompts";
import type { IPromptRepository } from "../domain/types.js";

export interface ResolvedPromptContext {
  prompt: PromptDefinition;
  version: PromptVersion;
  releaseHead?: PromptReleaseHead | undefined;
  environment: PromptReleaseEnvironment;
  isPinnedVersion: boolean;
}

export interface PromptCacheEntry {
  context: ResolvedPromptContext;
  expiresAtMs: number;
}

export class PromptResolver {
  private cache = new Map<string, PromptCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxCacheSize: number;

  constructor(
    private readonly repository: IPromptRepository,
    options: { ttlMs?: number | undefined; maxCacheSize?: number | undefined } = {}
  ) {
    this.ttlMs = options.ttlMs ?? 30_000; // 30s TTL
    this.maxCacheSize = options.maxCacheSize ?? 2000;
  }

  public async resolve(
    organizationId: string,
    promptKey: string,
    environment: PromptReleaseEnvironment = "production",
    workspaceId?: string | undefined,
    pinnedVersion?: number | undefined
  ): Promise<ResolvedPromptContext> {
    const cacheKey = `${organizationId}:${workspaceId || "noworkspace"}:${promptKey}:${environment}:${pinnedVersion || "active"}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAtMs > now) {
      return cached.context;
    }

    // 1. Lookup prompt definition
    const prompt = await this.repository.getDefinitionByKey(organizationId, promptKey, workspaceId);
    if (!prompt) {
      throw new PromptNotFoundError(`Prompt '${promptKey}' not found for tenant`);
    }

    if (prompt.status === "archived") {
      throw new PromptNotFoundError(`Prompt '${promptKey}' is archived`);
    }

    // 2. Resolve version: pinned version or active release head
    let version: PromptVersion | null = null;
    let head: PromptReleaseHead | null = null;

    if (pinnedVersion) {
      version = await this.repository.getVersionByNumber(prompt.id, pinnedVersion);
      if (!version) {
        throw new PromptNotFoundError(`Pinned version ${pinnedVersion} for prompt '${promptKey}' not found`);
      }
    } else {
      head = await this.repository.getReleaseHead(prompt.id, environment);
      if (!head) {
        throw new PromptReleaseError(`No active release found for prompt '${promptKey}' in '${environment}' environment`);
      }
      version = await this.repository.getVersionById(head.activeVersionId);
      if (!version) {
        throw new PromptNotFoundError(`Active release version for prompt '${promptKey}' not found`);
      }
    }

    const context: ResolvedPromptContext = {
      prompt,
      version,
      ...(head ? { releaseHead: head } : {}),
      environment,
      isPinnedVersion: !!pinnedVersion,
    };

    // Bounded cache
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(cacheKey, {
      context,
      expiresAtMs: now + this.ttlMs,
    });

    return context;
  }

  public invalidate(organizationId: string, promptKey: string, environment?: string): void {
    const prefix = `${organizationId}:`;
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(prefix) && key.includes(`:${promptKey}:`)) {
        if (!environment || key.includes(`:${environment}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  public invalidateAll(): void {
    this.cache.clear();
  }
}
