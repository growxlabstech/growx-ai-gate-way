import {
  BatchJobRecord,
  BatchItemRecord,
  BatchItemAttemptRecord,
  BatchChunkRecord,
  BatchLeaseRecord,
  BatchExecutionReservationRecord,
  BatchIdempotencyRecord,
  BatchJobStatus,
  BatchItemStatus,
  BatchNotFoundError,
  BatchItemNotFoundError,
} from "../domain/types.js";
import { assertValidJobTransition, assertValidItemTransition } from "../domain/state-machine.js";

export interface BatchRepository {
  createBatchJob(job: BatchJobRecord, reservation?: BatchExecutionReservationRecord): Promise<BatchJobRecord>;
  createBatchItems(items: BatchItemRecord[]): Promise<void>;
  getBatchJob(organizationId: string, id: string): Promise<BatchJobRecord | null>;
  getBatchJobById(id: string): Promise<BatchJobRecord | null>;
  listBatchJobs(organizationId: string, query?: { status?: BatchJobStatus; limit?: number; cursor?: string }): Promise<{ data: BatchJobRecord[]; hasMore: boolean; nextCursor: string | null }>;
  updateBatchJob(job: BatchJobRecord): Promise<BatchJobRecord>;
  updateBatchJobStatus(id: string, toStatus: BatchJobStatus, updates?: Partial<BatchJobRecord>): Promise<BatchJobRecord>;
  updateBatchJobCounters(id: string, delta: { succeeded?: number; failed?: number; cancelled?: number; running?: number; pending?: number }): Promise<BatchJobRecord>;
  
  getBatchItem(organizationId: string, batchId: string, customIdOrId: string): Promise<BatchItemRecord | null>;
  getBatchItemById(id: string): Promise<BatchItemRecord | null>;
  listBatchItems(organizationId: string, batchId: string, limit?: number, cursor?: string): Promise<{ data: BatchItemRecord[]; hasMore: boolean; nextCursor: string | null }>;
  getAllBatchItems(batchId: string): Promise<BatchItemRecord[]>;
  updateBatchItem(item: BatchItemRecord): Promise<BatchItemRecord>;
  
  claimBatchItems(batchId: string, workerId: string, limit: number, leaseDurationMs: number): Promise<BatchItemRecord[]>;
  claimRunnableBatchItemsFair(workerId: string, limit: number, leaseDurationMs: number, maxPerTenant: number): Promise<BatchItemRecord[]>;
  recordBatchItemAttempt(attempt: BatchItemAttemptRecord): Promise<void>;
  
  acquireLease(resourceType: string, resourceId: string, leaseOwner: string, durationMs: number): Promise<boolean>;
  renewLease(resourceType: string, resourceId: string, leaseOwner: string, durationMs: number): Promise<boolean>;
  releaseLease(resourceType: string, resourceId: string, leaseOwner: string): Promise<void>;
  findExpiredLeases(now: Date): Promise<BatchLeaseRecord[]>;
  
  findRunnableBatchJobs(limit?: number): Promise<BatchJobRecord[]>;
  findExpiredBatchJobs(now: Date): Promise<BatchJobRecord[]>;
  
  createIdempotencyRecord(record: BatchIdempotencyRecord): Promise<void>;
  findIdempotencyRecord(organizationId: string, idempotencyKey: string): Promise<BatchIdempotencyRecord | null>;
  
  getReservation(batchId: string): Promise<BatchExecutionReservationRecord | null>;
  updateReservation(reservation: BatchExecutionReservationRecord): Promise<void>;
}

export class InMemoryBatchRepository implements BatchRepository {
  private jobs = new Map<string, BatchJobRecord>();
  private items = new Map<string, BatchItemRecord>();
  private attempts = new Map<string, BatchItemAttemptRecord>();
  private leases = new Map<string, BatchLeaseRecord>();
  private reservations = new Map<string, BatchExecutionReservationRecord>();
  private idempotencyRecords = new Map<string, BatchIdempotencyRecord>();

  async createBatchJob(job: BatchJobRecord, reservation?: BatchExecutionReservationRecord): Promise<BatchJobRecord> {
    this.jobs.set(job.id, { ...job });
    if (reservation) {
      this.reservations.set(reservation.batchId, { ...reservation });
    }
    return { ...job };
  }

  async createBatchItems(items: BatchItemRecord[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, { ...item });
    }
  }

  async getBatchJob(organizationId: string, id: string): Promise<BatchJobRecord | null> {
    const job = this.jobs.get(id);
    if (!job || job.organizationId !== organizationId) return null;
    return { ...job };
  }

  async getBatchJobById(id: string): Promise<BatchJobRecord | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async listBatchJobs(organizationId: string, query: { status?: BatchJobStatus; limit?: number; cursor?: string } = {}): Promise<{ data: BatchJobRecord[]; hasMore: boolean; nextCursor: string | null }> {
    const limit = query.limit ?? 20;
    let list = Array.from(this.jobs.values())
      .filter(j => j.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (query.status) {
      list = list.filter(j => j.status === query.status);
    }

    if (query.cursor) {
      const idx = list.findIndex(j => j.id === query.cursor);
      if (idx >= 0) {
        list = list.slice(idx + 1);
      }
    }

    const page = list.slice(0, limit);
    const hasMore = list.length > limit;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return {
      data: page.map(j => ({ ...j })),
      hasMore,
      nextCursor,
    };
  }

  async updateBatchJob(job: BatchJobRecord): Promise<BatchJobRecord> {
    const existing = this.jobs.get(job.id);
    if (!existing) throw new BatchNotFoundError(job.id);
    const updated = { ...job, updatedAt: new Date() };
    this.jobs.set(job.id, updated);
    return { ...updated };
  }

  async updateBatchJobStatus(id: string, toStatus: BatchJobStatus, updates: Partial<BatchJobRecord> = {}): Promise<BatchJobRecord> {
    const job = this.jobs.get(id);
    if (!job) throw new BatchNotFoundError(id);
    assertValidJobTransition(job.status, toStatus, id);
    const updated: BatchJobRecord = {
      ...job,
      ...updates,
      status: toStatus,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }

  async updateBatchJobCounters(id: string, delta: { succeeded?: number; failed?: number; cancelled?: number; running?: number; pending?: number }): Promise<BatchJobRecord> {
    const job = this.jobs.get(id);
    if (!job) throw new BatchNotFoundError(id);
    const updated: BatchJobRecord = {
      ...job,
      succeededItems: Math.max(0, job.succeededItems + (delta.succeeded ?? 0)),
      failedItems: Math.max(0, job.failedItems + (delta.failed ?? 0)),
      cancelledItems: Math.max(0, job.cancelledItems + (delta.cancelled ?? 0)),
      runningItems: Math.max(0, job.runningItems + (delta.running ?? 0)),
      pendingItems: Math.max(0, job.pendingItems + (delta.pending ?? 0)),
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }

  async getBatchItem(organizationId: string, batchId: string, customIdOrId: string): Promise<BatchItemRecord | null> {
    for (const item of this.items.values()) {
      if (item.batchId === batchId && item.organizationId === organizationId && (item.id === customIdOrId || item.customId === customIdOrId)) {
        return { ...item };
      }
    }
    return null;
  }

  async getBatchItemById(id: string): Promise<BatchItemRecord | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async listBatchItems(organizationId: string, batchId: string, limit = 50, cursor?: string): Promise<{ data: BatchItemRecord[]; hasMore: boolean; nextCursor: string | null }> {
    let list = Array.from(this.items.values())
      .filter(i => i.batchId === batchId && i.organizationId === organizationId)
      .sort((a, b) => a.position - b.position);

    if (cursor) {
      const idx = list.findIndex(i => i.id === cursor);
      if (idx >= 0) {
        list = list.slice(idx + 1);
      }
    }

    const page = list.slice(0, limit);
    const hasMore = list.length > limit;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return {
      data: page.map(i => ({ ...i })),
      hasMore,
      nextCursor,
    };
  }

  async getAllBatchItems(batchId: string): Promise<BatchItemRecord[]> {
    return Array.from(this.items.values())
      .filter(i => i.batchId === batchId)
      .sort((a, b) => a.position - b.position)
      .map(i => ({ ...i }));
  }

  async updateBatchItem(item: BatchItemRecord): Promise<BatchItemRecord> {
    const existing = this.items.get(item.id);
    if (!existing) throw new BatchItemNotFoundError(item.id);
    assertValidItemTransition(existing.status, item.status, item.id);
    const updated = { ...item, updatedAt: new Date() };
    this.items.set(item.id, updated);
    return { ...updated };
  }

  async claimBatchItems(batchId: string, workerId: string, limit: number, leaseDurationMs: number): Promise<BatchItemRecord[]> {
    const now = new Date();
    const claimed: BatchItemRecord[] = [];

    const candidates = Array.from(this.items.values())
      .filter(i => i.batchId === batchId && (i.status === "pending" || i.status === "queued" || (i.status === "retry_wait" && (!i.retryAfterAt || i.retryAfterAt <= now))))
      .sort((a, b) => a.position - b.position);

    for (const item of candidates) {
      if (claimed.length >= limit) break;
      const leaseKey = `batch_item:${item.id}`;
      const existingLease = this.leases.get(leaseKey);
      if (existingLease && existingLease.expiresAt > now && existingLease.leaseOwner !== workerId) {
        continue; // Active lease by another worker
      }

      // Acquire lease
      this.leases.set(leaseKey, {
        id: `lease_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        resourceType: "batch_item",
        resourceId: item.id,
        leaseOwner: workerId,
        expiresAt: new Date(now.getTime() + leaseDurationMs),
        acquiredAt: now,
      });

      const updated: BatchItemRecord = {
        ...item,
        status: "running",
        startedAt: item.startedAt ?? now,
        attemptCount: item.attemptCount + 1,
        updatedAt: now,
      };
      this.items.set(item.id, updated);
      claimed.push({ ...updated });
    }

    return claimed;
  }

  async claimRunnableBatchItemsFair(workerId: string, limit: number, leaseDurationMs: number, maxPerTenant: number): Promise<BatchItemRecord[]> {
    const now = new Date();
    const claimed: BatchItemRecord[] = [];
    const tenantCounts = new Map<string, number>();

    // Find all active batch IDs that are 'queued' or 'running'
    const activeBatchIds = new Set(
      Array.from(this.jobs.values())
        .filter(j => j.status === "queued" || j.status === "running")
        .map(j => j.id)
    );

    const candidates = Array.from(this.items.values())
      .filter(i => activeBatchIds.has(i.batchId) && (i.status === "pending" || i.status === "queued" || (i.status === "retry_wait" && (!i.retryAfterAt || i.retryAfterAt <= now))))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const item of candidates) {
      if (claimed.length >= limit) break;
      const currentTenantCount = tenantCounts.get(item.organizationId) ?? 0;
      if (currentTenantCount >= maxPerTenant) continue;

      const leaseKey = `batch_item:${item.id}`;
      const existingLease = this.leases.get(leaseKey);
      if (existingLease && existingLease.expiresAt > now && existingLease.leaseOwner !== workerId) {
        continue;
      }

      this.leases.set(leaseKey, {
        id: `lease_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        resourceType: "batch_item",
        resourceId: item.id,
        leaseOwner: workerId,
        expiresAt: new Date(now.getTime() + leaseDurationMs),
        acquiredAt: now,
      });

      const updated: BatchItemRecord = {
        ...item,
        status: "running",
        startedAt: item.startedAt ?? now,
        attemptCount: item.attemptCount + 1,
        updatedAt: now,
      };
      this.items.set(item.id, updated);
      tenantCounts.set(item.organizationId, currentTenantCount + 1);
      claimed.push({ ...updated });
    }

    return claimed;
  }

  async recordBatchItemAttempt(attempt: BatchItemAttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, { ...attempt });
  }

  async acquireLease(resourceType: string, resourceId: string, leaseOwner: string, durationMs: number): Promise<boolean> {
    const key = `${resourceType}:${resourceId}`;
    const now = new Date();
    const existing = this.leases.get(key);
    if (existing && existing.expiresAt > now && existing.leaseOwner !== leaseOwner) {
      return false;
    }
    this.leases.set(key, {
      id: `lease_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      resourceType,
      resourceId,
      leaseOwner,
      expiresAt: new Date(now.getTime() + durationMs),
      acquiredAt: now,
    });
    return true;
  }

  async renewLease(resourceType: string, resourceId: string, leaseOwner: string, durationMs: number): Promise<boolean> {
    const key = `${resourceType}:${resourceId}`;
    const now = new Date();
    const existing = this.leases.get(key);
    if (!existing || existing.leaseOwner !== leaseOwner) {
      return false;
    }
    this.leases.set(key, {
      ...existing,
      expiresAt: new Date(now.getTime() + durationMs),
    });
    return true;
  }

  async releaseLease(resourceType: string, resourceId: string, leaseOwner: string): Promise<void> {
    const key = `${resourceType}:${resourceId}`;
    const existing = this.leases.get(key);
    if (existing && existing.leaseOwner === leaseOwner) {
      this.leases.delete(key);
    }
  }

  async findExpiredLeases(now: Date): Promise<BatchLeaseRecord[]> {
    return Array.from(this.leases.values()).filter(l => l.expiresAt <= now);
  }

  async findRunnableBatchJobs(limit = 100): Promise<BatchJobRecord[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.status === "validating" || j.status === "queued" || j.status === "running" || j.status === "cancelling" || j.status === "finalizing")
      .slice(0, limit)
      .map(j => ({ ...j }));
  }

  async findExpiredBatchJobs(now: Date): Promise<BatchJobRecord[]> {
    return Array.from(this.jobs.values())
      .filter(j => (j.status === "queued" || j.status === "running" || j.status === "validating") && !!j.executionDeadlineAt && j.executionDeadlineAt <= now)
      .map(j => ({ ...j }));
  }

  async createIdempotencyRecord(record: BatchIdempotencyRecord): Promise<void> {
    const key = `${record.organizationId}:${record.idempotencyKey}`;
    this.idempotencyRecords.set(key, { ...record });
  }

  async findIdempotencyRecord(organizationId: string, idempotencyKey: string): Promise<BatchIdempotencyRecord | null> {
    const key = `${organizationId}:${idempotencyKey}`;
    const record = this.idempotencyRecords.get(key);
    if (!record || record.expiresAt <= new Date()) {
      return null;
    }
    return { ...record };
  }

  async getReservation(batchId: string): Promise<BatchExecutionReservationRecord | null> {
    const res = this.reservations.get(batchId);
    return res ? { ...res } : null;
  }

  async updateReservation(reservation: BatchExecutionReservationRecord): Promise<void> {
    this.reservations.set(reservation.batchId, { ...reservation });
  }
}
