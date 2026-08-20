import { randomUUID } from "node:crypto";
import type {
  AtomicReservationRequest,
  AtomicReservationResult,
  ReservedScopeAmount,
} from "./types.js";

export interface IRuntimeCounterStore {
  checkAndReserveAtomic(
    reservations: AtomicReservationRequest[],
    now?: Date
  ): Promise<AtomicReservationResult>;

  acquireConcurrencyPermit(
    key: string,
    limit: number,
    ttlSeconds: number,
    now?: Date
  ): Promise<{ acquired: boolean; permitId?: string | undefined; current: number }>;

  releaseConcurrencyPermit(key: string, permitId: string): Promise<boolean>;

  renewConcurrencyPermit(
    key: string,
    permitId: string,
    ttlSeconds: number,
    now?: Date
  ): Promise<boolean>;

  finalizeTokens(
    key: string,
    windowSeconds: number,
    reservedAmount: number,
    actualAmount: number,
    now?: Date
  ): Promise<void>;

  rollbackReservation(
    scopes: ReservedScopeAmount[],
    now?: Date
  ): Promise<void>;

  getCapacityMetrics(
    keys: string[],
    now?: Date
  ): Promise<
    Record<
      string,
      {
        used: number;
        limit: number;
        remaining: number;
        activeConcurrency: number;
      }
    >
  >;

  resetKey(key: string): Promise<void>;
  clearAll(): Promise<void>;
}

interface WindowBucket {
  timestampSec: number;
  amount: number;
}

interface SlidingWindowCounter {
  buckets: WindowBucket[];
  windowSeconds: number;
  limit: number;
}

interface ConcurrencyLeaseRecord {
  permitId: string;
  expiresAtMs: number;
}

/**
 * Thread-safe In-Memory Counter Store with sliding-window log buckets,
 * atomic multi-scope evaluation, concurrency lease tracking, and token reconciliation.
 */
export class InMemoryCounterStore implements IRuntimeCounterStore {
  private readonly counters = new Map<string, SlidingWindowCounter>();
  private readonly concurrency = new Map<string, Map<string, ConcurrencyLeaseRecord>>();

  private getWindowUsed(counter: SlidingWindowCounter, nowSec: number): number {
    const minTime = nowSec - counter.windowSeconds;
    // Clean old buckets
    counter.buckets = counter.buckets.filter((b) => b.timestampSec > minTime);
    return counter.buckets.reduce((sum, b) => sum + b.amount, 0);
  }

  private cleanExpiredConcurrency(key: string, nowMs: number): number {
    const permits = this.concurrency.get(key);
    if (!permits) return 0;

    for (const [id, record] of permits.entries()) {
      if (record.expiresAtMs <= nowMs) {
        permits.delete(id);
      }
    }
    return permits.size;
  }

  async checkAndReserveAtomic(
    reservations: AtomicReservationRequest[],
    now = new Date()
  ): Promise<AtomicReservationResult> {
    const nowSec = Math.floor(now.getTime() / 1000);

    // 1. Dry run check all limits
    for (let i = 0; i < reservations.length; i++) {
      const req = reservations[i]!;
      if (!req.hard && req.limit <= 0) continue; // Unlimited or soft-only
      if (req.limit <= 0) continue; // Unlimited

      let counter = this.counters.get(req.key);
      if (!counter) {
        counter = { buckets: [], windowSeconds: req.windowSeconds, limit: req.limit };
        this.counters.set(req.key, counter);
      }
      counter.windowSeconds = req.windowSeconds;
      counter.limit = req.limit;

      const used = this.getWindowUsed(counter, nowSec);
      const effectiveLimit = req.limit + (req.burst ?? 0);

      if (used + req.amount > effectiveLimit) {
        // Limit breached!
        const remaining = Math.max(0, effectiveLimit - used);
        const resetAt = new Date((nowSec + req.windowSeconds) * 1000);
        const retryAfterSeconds = Math.max(1, Math.ceil(req.windowSeconds / 2));

        return {
          allowed: false,
          blockingIndex: i,
          blockingRequest: req,
          used,
          remaining,
          resetAt,
          retryAfterSeconds,
        };
      }
    }

    // 2. All passed -> Commit atomic reservations
    for (const req of reservations) {
      let counter = this.counters.get(req.key);
      if (!counter) {
        counter = { buckets: [], windowSeconds: req.windowSeconds, limit: req.limit };
        this.counters.set(req.key, counter);
      }

      // Add to current second bucket
      let currentBucket = counter.buckets.find((b) => b.timestampSec === nowSec);
      if (!currentBucket) {
        currentBucket = { timestampSec: nowSec, amount: 0 };
        counter.buckets.push(currentBucket);
      }
      currentBucket.amount += req.amount;
    }

    return { allowed: true };
  }

  async acquireConcurrencyPermit(
    key: string,
    limit: number,
    ttlSeconds: number,
    now = new Date()
  ): Promise<{ acquired: boolean; permitId?: string; current: number }> {
    const nowMs = now.getTime();
    this.cleanExpiredConcurrency(key, nowMs);

    let permits = this.concurrency.get(key);
    if (!permits) {
      permits = new Map<string, ConcurrencyLeaseRecord>();
      this.concurrency.set(key, permits);
    }

    const current = permits.size;
    if (limit > 0 && current >= limit) {
      return { acquired: false, current };
    }

    const permitId = `pmt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    permits.set(permitId, {
      permitId,
      expiresAtMs: nowMs + ttlSeconds * 1000,
    });

    return { acquired: true, permitId, current: permits.size };
  }

  async releaseConcurrencyPermit(key: string, permitId: string): Promise<boolean> {
    const permits = this.concurrency.get(key);
    if (!permits) return false;
    const deleted = permits.delete(permitId);
    if (permits.size === 0) {
      this.concurrency.delete(key);
    }
    return deleted;
  }

  async renewConcurrencyPermit(
    key: string,
    permitId: string,
    ttlSeconds: number,
    now = new Date()
  ): Promise<boolean> {
    const nowMs = now.getTime();
    const permits = this.concurrency.get(key);
    if (!permits) return false;

    const record = permits.get(permitId);
    if (!record) return false;

    if (record.expiresAtMs <= nowMs) {
      permits.delete(permitId);
      return false;
    }

    record.expiresAtMs = nowMs + ttlSeconds * 1000;
    return true;
  }

  async finalizeTokens(
    key: string,
    _windowSeconds: number,
    reservedAmount: number,
    actualAmount: number,
    now = new Date()
  ): Promise<void> {
    const nowSec = Math.floor(now.getTime() / 1000);
    const counter = this.counters.get(key);
    if (!counter) return;

    const diff = actualAmount - reservedAmount;
    if (diff === 0) return;

    if (diff < 0) {
      // Over-reserved: refund unused token capacity from latest buckets
      let toRefund = Math.abs(diff);
      for (let i = counter.buckets.length - 1; i >= 0 && toRefund > 0; i--) {
        const bucket = counter.buckets[i]!;
        const deduct = Math.min(bucket.amount, toRefund);
        bucket.amount -= deduct;
        toRefund -= deduct;
      }
    } else {
      // Under-reserved: add extra tokens consumed
      let currentBucket = counter.buckets.find((b) => b.timestampSec === nowSec);
      if (!currentBucket) {
        currentBucket = { timestampSec: nowSec, amount: 0 };
        counter.buckets.push(currentBucket);
      }
      currentBucket.amount += diff;
    }
  }

  async rollbackReservation(
    scopes: ReservedScopeAmount[],
    _now = new Date()
  ): Promise<void> {
    for (const scope of scopes) {
      const counter = this.counters.get(scope.counterKey);
      if (!counter) continue;

      let toRefund = scope.reservedAmount;
      for (let i = counter.buckets.length - 1; i >= 0 && toRefund > 0; i--) {
        const bucket = counter.buckets[i]!;
        const deduct = Math.min(bucket.amount, toRefund);
        bucket.amount -= deduct;
        toRefund -= deduct;
      }
    }
  }

  async getCapacityMetrics(
    keys: string[],
    now = new Date()
  ): Promise<
    Record<
      string,
      {
        used: number;
        limit: number;
        remaining: number;
        activeConcurrency: number;
      }
    >
  > {
    const nowSec = Math.floor(now.getTime() / 1000);
    const nowMs = now.getTime();
    const result: Record<
      string,
      {
        used: number;
        limit: number;
        remaining: number;
        activeConcurrency: number;
      }
    > = {};

    for (const key of keys) {
      const counter = this.counters.get(key);
      const used = counter ? this.getWindowUsed(counter, nowSec) : 0;
      const limit = counter ? counter.limit : 0;
      const remaining = limit > 0 ? Math.max(0, limit - used) : 999999;
      const activeConcurrency = this.cleanExpiredConcurrency(key, nowMs);

      result[key] = {
        used,
        limit,
        remaining,
        activeConcurrency,
      };
    }

    return result;
  }

  async resetKey(key: string): Promise<void> {
    this.counters.delete(key);
    this.concurrency.delete(key);
  }

  async clearAll(): Promise<void> {
    this.counters.clear();
    this.concurrency.clear();
  }
}
