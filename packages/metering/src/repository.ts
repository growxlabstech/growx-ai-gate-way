import type {
  GatewayAttemptRecord,
  GatewayRequestRecord,
  UsageAggregate,
  UsageEvent,
  UsageReconciliationRecord,
} from "./types.js";
import { UsageAggregateProjector } from "./projector.js";

export interface AggregateQueryOptions {
  organizationId: string;
  workspaceId?: string | undefined;
  apiKeyId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerId?: string | undefined;
  bucket?: "hourly" | "daily" | undefined;
  startTime?: Date | undefined;
  endTime?: Date | undefined;
  limit?: number | undefined;
}

export interface IUsageLedgerRepository {
  saveRequestRecord(record: GatewayRequestRecord): Promise<void>;
  getRequestRecord(requestId: string): Promise<GatewayRequestRecord | null>;
  updateRequestRecord(record: GatewayRequestRecord): Promise<void>;

  saveAttemptRecord(record: GatewayAttemptRecord): Promise<void>;
  getAttemptRecord(attemptId: string): Promise<GatewayAttemptRecord | null>;
  listAttemptsForRequest(requestId: string): Promise<GatewayAttemptRecord[]>;

  appendUsageEvent(event: UsageEvent): Promise<"appended" | "duplicate">;
  appendUsageEventsBatch(events: readonly UsageEvent[]): Promise<{ appended: number; duplicates: number }>;
  listUsageEventsForRequest(requestId: string): Promise<UsageEvent[]>;
  queryUsageEvents(options: { organizationId: string; workspaceId?: string; limit?: number }): Promise<UsageEvent[]>;

  saveAggregate(aggregate: UsageAggregate): Promise<void>;
  getAggregate(id: string): Promise<UsageAggregate | null>;
  queryAggregates(options: AggregateQueryOptions): Promise<UsageAggregate[]>;
  rebuildAggregates(): Promise<{ processedEvents: number; aggregateCount: number }>;

  saveReconciliation(record: UsageReconciliationRecord): Promise<void>;
  listReconciliationsForRequest(requestId: string): Promise<UsageReconciliationRecord[]>;
}

export class InMemoryUsageLedgerRepository implements IUsageLedgerRepository {
  private readonly requests = new Map<string, GatewayRequestRecord>();
  private readonly attempts = new Map<string, GatewayAttemptRecord>();
  private readonly events = new Map<string, UsageEvent>();
  private readonly idempotencyIndex = new Set<string>();
  private readonly aggregates = new Map<string, UsageAggregate>();
  private readonly reconciliations = new Map<string, UsageReconciliationRecord>();
  private readonly projector = new UsageAggregateProjector();

  public async saveRequestRecord(record: GatewayRequestRecord): Promise<void> {
    this.requests.set(record.requestId, { ...record });
  }

  public async getRequestRecord(requestId: string): Promise<GatewayRequestRecord | null> {
    const rec = this.requests.get(requestId);
    return rec ? { ...rec } : null;
  }

  public async updateRequestRecord(record: GatewayRequestRecord): Promise<void> {
    this.requests.set(record.requestId, { ...record, updatedAt: new Date() });
  }

  public async saveAttemptRecord(record: GatewayAttemptRecord): Promise<void> {
    this.attempts.set(record.id, { ...record });
  }

  public async getAttemptRecord(attemptId: string): Promise<GatewayAttemptRecord | null> {
    const rec = this.attempts.get(attemptId);
    return rec ? { ...rec } : null;
  }

  public async listAttemptsForRequest(requestId: string): Promise<GatewayAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.requestId === requestId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  public async appendUsageEvent(event: UsageEvent): Promise<"appended" | "duplicate"> {
    if (this.idempotencyIndex.has(event.idempotencyKey) || this.events.has(event.id)) {
      return "duplicate";
    }

    this.events.set(event.id, { ...event });
    this.idempotencyIndex.add(event.idempotencyKey);

    // Apply incrementally to aggregates
    const rebuildMap = this.projector.rebuildAggregates([event]);
    for (const [key, agg] of rebuildMap.entries()) {
      const existing = this.aggregates.get(key);
      if (existing) {
        this.aggregates.set(key, this.projector.projectEvent(existing, event));
      } else {
        this.aggregates.set(key, agg);
      }
    }

    return "appended";
  }

  public async appendUsageEventsBatch(
    events: readonly UsageEvent[]
  ): Promise<{ appended: number; duplicates: number }> {
    let appended = 0;
    let duplicates = 0;

    for (const event of events) {
      const result = await this.appendUsageEvent(event);
      if (result === "appended") {
        appended++;
      } else {
        duplicates++;
      }
    }

    return { appended, duplicates };
  }

  public async listUsageEventsForRequest(requestId: string): Promise<UsageEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.requestId === requestId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  public async queryUsageEvents(options: {
    organizationId: string;
    workspaceId?: string;
    limit?: number;
  }): Promise<UsageEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => {
        if (e.organizationId !== options.organizationId) return false;
        if (options.workspaceId && e.workspaceId !== options.workspaceId) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, options.limit ?? 100);
  }

  public async saveAggregate(aggregate: UsageAggregate): Promise<void> {
    this.aggregates.set(aggregate.id, { ...aggregate });
  }

  public async getAggregate(id: string): Promise<UsageAggregate | null> {
    const agg = this.aggregates.get(id);
    return agg ? { ...agg } : null;
  }

  public async queryAggregates(options: AggregateQueryOptions): Promise<UsageAggregate[]> {
    return Array.from(this.aggregates.values())
      .filter((agg) => {
        if (agg.organizationId !== options.organizationId) return false;
        if (options.workspaceId && agg.workspaceId !== options.workspaceId) return false;
        if (options.apiKeyId && agg.apiKeyId !== options.apiKeyId) return false;
        if (options.canonicalModelId && agg.canonicalModelId !== options.canonicalModelId) return false;
        if (options.providerId && agg.providerId !== options.providerId) return false;
        if (options.bucket && agg.bucket !== options.bucket) return false;
        if (options.startTime && agg.bucketStart < options.startTime) return false;
        if (options.endTime && agg.bucketEnd > options.endTime) return false;
        return true;
      })
      .sort((a, b) => b.bucketStart.getTime() - a.bucketStart.getTime())
      .slice(0, options.limit ?? 100);
  }

  public async rebuildAggregates(): Promise<{ processedEvents: number; aggregateCount: number }> {
    this.aggregates.clear();
    const allEvents = Array.from(this.events.values());
    const builtMap = this.projector.rebuildAggregates(allEvents);
    for (const [key, agg] of builtMap.entries()) {
      this.aggregates.set(key, agg);
    }
    return {
      processedEvents: allEvents.length,
      aggregateCount: this.aggregates.size,
    };
  }

  public async saveReconciliation(record: UsageReconciliationRecord): Promise<void> {
    this.reconciliations.set(record.id, { ...record });
  }

  public async listReconciliationsForRequest(requestId: string): Promise<UsageReconciliationRecord[]> {
    return Array.from(this.reconciliations.values()).filter((r) => r.requestId === requestId);
  }
}
