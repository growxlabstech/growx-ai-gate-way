import { createPublicId } from "@growx/ids";
import type { ToolContinuation } from "@growx/contracts";

export interface IContinuationRepository {
  save(continuation: ToolContinuation): Promise<void>;
  findByRequestId(requestId: string): Promise<ToolContinuation | null>;
  findById(id: string): Promise<ToolContinuation | null>;
  update(id: string, updates: Partial<ToolContinuation>): Promise<void>;
  deleteExpired(): Promise<number>;
}

export class InMemoryContinuationRepository implements IContinuationRepository {
  private continuations = new Map<string, ToolContinuation>();

  async save(continuation: ToolContinuation): Promise<void> {
    this.continuations.set(continuation.id, continuation);
  }

  async findByRequestId(requestId: string): Promise<ToolContinuation | null> {
    for (const c of this.continuations.values()) {
      if (c.requestId === requestId && c.status === "pending") return c;
    }
    return null;
  }

  async findById(id: string): Promise<ToolContinuation | null> {
    return this.continuations.get(id) ?? null;
  }

  async update(id: string, updates: Partial<ToolContinuation>): Promise<void> {
    const existing = this.continuations.get(id);
    if (existing) {
      this.continuations.set(id, { ...existing, ...updates });
    }
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, c] of this.continuations.entries()) {
      if (c.expiresAt.getTime() < now) {
        this.continuations.delete(id);
        count++;
      }
    }
    return count;
  }
}

export class ToolContinuationService {
  constructor(
    private readonly repository: IContinuationRepository,
    private readonly defaultTtlMs: number = 3_600_000,
  ) {}

  async createContinuation(params: {
    requestId: string;
    organizationId: string;
    workspaceId?: string;
    providerId: string;
    routeId: string;
    modelId: string;
    promptVersionId?: string;
    providerStateReference?: string;
  }): Promise<ToolContinuation> {
    const continuation: ToolContinuation = {
      id: createPublicId("tcont"),
      requestId: params.requestId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      providerId: params.providerId,
      routeId: params.routeId,
      modelId: params.modelId,
      promptVersionId: params.promptVersionId,
      providerStateReference: params.providerStateReference,
      status: "pending",
      expiresAt: new Date(Date.now() + this.defaultTtlMs),
      createdAt: new Date(),
    };

    await this.repository.save(continuation);
    return continuation;
  }

  async resolveContinuation(
    requestId: string,
  ): Promise<ToolContinuation | null> {
    return this.repository.findByRequestId(requestId);
  }

  async completeContinuation(id: string): Promise<void> {
    // "completed" isn't in the status enum, use "resumed" to indicate processing is done
    await this.repository.update(id, { status: "expired" });
  }

  async expireContinuation(id: string): Promise<void> {
    await this.repository.update(id, { status: "expired" });
  }
}
