import type {
  ProviderOperation,
  ProviderOperationFilter,
  ProviderOperationStatus,
} from "@growx/contracts";

export interface IProviderOperationRepository {
  insert(op: ProviderOperation): Promise<void>;
  getById(id: string): Promise<ProviderOperation | null>;
  getByProviderOperationId(
    providerId: string,
    providerOperationId: string,
  ): Promise<ProviderOperation | null>;
  update(
    id: string,
    patch: Partial<ProviderOperation>,
  ): Promise<ProviderOperation>;
  claimDueForPolling(options: {
    dueBefore: Date;
    limit: number;
    leaseOwner: string;
    leaseDurationMs: number;
  }): Promise<ProviderOperation[]>;
  releaseLease(
    id: string,
    leaseOwner: string,
    nextPollAt?: Date,
  ): Promise<void>;
  findStuckOperations(options: {
    statuses: ProviderOperationStatus[];
    stuckBefore: Date;
    limit: number;
  }): Promise<ProviderOperation[]>;
  list(filter: ProviderOperationFilter): Promise<ProviderOperation[]>;
}

export class InMemoryProviderOperationRepository implements IProviderOperationRepository {
  private operations = new Map<string, ProviderOperation>();

  public async insert(op: ProviderOperation): Promise<void> {
    this.operations.set(op.id, { ...op });
  }

  public async getById(id: string): Promise<ProviderOperation | null> {
    const op = this.operations.get(id);
    return op ? { ...op } : null;
  }

  public async getByProviderOperationId(
    providerId: string,
    providerOperationId: string,
  ): Promise<ProviderOperation | null> {
    for (const op of this.operations.values()) {
      if (
        op.providerId === providerId &&
        op.providerOperationId === providerOperationId
      ) {
        return { ...op };
      }
    }
    return null;
  }

  public async update(
    id: string,
    patch: Partial<ProviderOperation>,
  ): Promise<ProviderOperation> {
    const existing = this.operations.get(id);
    if (!existing) {
      throw new Error(`Provider operation '${id}' not found`);
    }
    const updated = { ...existing, ...patch };
    this.operations.set(id, updated);
    return { ...updated };
  }

  public async claimDueForPolling(options: {
    dueBefore: Date;
    limit: number;
    leaseOwner: string;
    leaseDurationMs: number;
  }): Promise<ProviderOperation[]> {
    const now = new Date();
    const claimed: ProviderOperation[] = [];

    for (const op of this.operations.values()) {
      if (claimed.length >= options.limit) break;

      // Skip terminal states
      if (["completed", "failed", "cancelled", "expired"].includes(op.status)) {
        continue;
      }

      // Check if due for polling
      const isDue = op.nextPollAt ? op.nextPollAt <= options.dueBefore : true;
      if (!isDue) continue;

      // Check if lease is free or expired
      const isLeaseFree =
        !op.leaseOwner || (op.leaseExpiresAt && op.leaseExpiresAt < now);
      if (!isLeaseFree) continue;

      // Acquire lease
      const leaseExpiresAt = new Date(now.getTime() + options.leaseDurationMs);
      const updatedOp: ProviderOperation = {
        ...op,
        leaseOwner: options.leaseOwner,
        leaseExpiresAt,
        lastPolledAt: now,
      };
      this.operations.set(op.id, updatedOp);
      claimed.push({ ...updatedOp });
    }

    return claimed;
  }

  public async releaseLease(
    id: string,
    leaseOwner: string,
    nextPollAt?: Date,
  ): Promise<void> {
    const op = this.operations.get(id);
    if (!op || op.leaseOwner !== leaseOwner) return;

    this.operations.set(id, {
      ...op,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...(nextPollAt !== undefined ? { nextPollAt } : {}),
    });
  }

  public async findStuckOperations(options: {
    statuses: ProviderOperationStatus[];
    stuckBefore: Date;
    limit: number;
  }): Promise<ProviderOperation[]> {
    const results: ProviderOperation[] = [];
    for (const op of this.operations.values()) {
      if (results.length >= options.limit) break;
      if (options.statuses.includes(op.status)) {
        const lastActivity = op.lastPolledAt || op.submittedAt || op.createdAt;
        if (lastActivity <= options.stuckBefore) {
          results.push({ ...op });
        }
      }
    }
    return results;
  }

  public async list(
    filter: ProviderOperationFilter,
  ): Promise<ProviderOperation[]> {
    const list = Array.from(this.operations.values());
    return list
      .filter((op) => {
        if (
          filter.organizationId &&
          op.organizationId !== filter.organizationId
        )
          return false;
        if (filter.workspaceId && op.workspaceId !== filter.workspaceId)
          return false;
        if (filter.providerId && op.providerId !== filter.providerId)
          return false;
        if (filter.operationType && op.operationType !== filter.operationType)
          return false;
        if (filter.status) {
          const statuses = Array.isArray(filter.status)
            ? filter.status
            : [filter.status];
          if (!statuses.includes(op.status)) return false;
        }
        return true;
      })
      .slice(0, filter.limit || 50);
  }
}
