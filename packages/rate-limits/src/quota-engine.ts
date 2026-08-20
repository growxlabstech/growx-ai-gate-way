import { randomUUID } from "node:crypto";
import type {
  AtomicReservationRequest,
  QuotaDecision,
  QuotaDenialCode,
  QuotaDimension,
  QuotaLimit,
  QuotaReservation,
  QuotaScopeType,
  ReservedScopeAmount,
  TokenEstimate,
} from "./types.js";
import type { IRuntimeCounterStore } from "./counter-store.js";
import type { IQuotaPolicyRepository } from "./quota-policy-store.js";

export interface QuotaEngineOptions {
  globalLimits?: {
    rpm?: number;
    tpm?: number;
    concurrentRequests?: number;
    concurrentStreams?: number;
  };
  defaultOrgLimits?: {
    rpm?: number;
    tpm?: number;
    concurrentRequests?: number;
    concurrentStreams?: number;
  };
  defaultWorkspaceLimits?: {
    rpm?: number;
    tpm?: number;
    concurrentRequests?: number;
    concurrentStreams?: number;
  };
  concurrencyLeaseTtlSeconds?: number;
}

export interface CustomerQuotaRequest {
  apiKey?: {
    id: string;
    rateLimits?: readonly { window: string; requestLimit: number }[] | undefined;
  } | undefined;
  organizationId: string;
  workspaceId: string;
  estimatedTokens: TokenEstimate;
  stream?: boolean | undefined;
  requestId?: string | undefined;
  now?: Date | undefined;
}

export interface ProviderAttemptQuotaRequest {
  routeId: string;
  providerId: string;
  estimatedTokens: TokenEstimate;
  stream?: boolean | undefined;
  attemptNumber: number;
  requestId?: string | undefined;
  now?: Date | undefined;
}

export class QuotaEngine {
  private readonly leaseTtlSec: number;

  constructor(
    public readonly counterStore: IRuntimeCounterStore,
    public readonly policyRepo: IQuotaPolicyRepository,
    private readonly options: QuotaEngineOptions = {}
  ) {
    this.leaseTtlSec = options.concurrencyLeaseTtlSeconds ?? 120; // 2 minute safety TTL
  }

  /**
   * Evaluates all customer-facing limits (Global, Organization, Workspace, API Key)
   * and atomically reserves capacity across all scopes before routing or provider calls.
   */
  async evaluateAndReserveCustomerQuota(
    request: CustomerQuotaRequest
  ): Promise<{ decision: QuotaDecision; reservation?: QuotaReservation }> {
    const now = request.now ?? new Date();
    const requestId = request.requestId ?? `req_${randomUUID().replace(/-/g, "")}`;
    const reservationId = `qres_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // 1. Gather all applicable limits across scopes
    const globalLimits = await this.policyRepo.getLimitsForScope("global", "global");
    const orgLimits = await this.policyRepo.getLimitsForScope("organization", request.organizationId);
    const wsLimits = await this.policyRepo.getLimitsForScope("workspace", request.workspaceId);
    const keyLimits = request.apiKey
      ? await this.policyRepo.getLimitsForScope("api_key", request.apiKey.id)
      : [];

    // Ingest API-key Phase 3 rateLimits if present and not in policyRepo
    if (request.apiKey?.rateLimits && request.apiKey.rateLimits.length > 0) {
      for (const rl of request.apiKey.rateLimits) {
        if (!keyLimits.some((kl) => kl.dimension === "requests")) {
          keyLimits.push({
            scopeType: "api_key",
            scopeId: request.apiKey.id,
            dimension: "requests",
            windowSeconds: rl.window === "hour" ? 3600 : rl.window === "day" ? 86400 : 60,
            limit: rl.requestLimit,
            hard: true,
            enabled: true,
            source: "api_key",
          });
        }
      }
    }

    // Apply defaults if no configured limit exists
    const effectiveGlobal = this.mergeDefaults(globalLimits, "global", "global", {
      rpm: this.options.globalLimits?.rpm ?? 50_000,
      tpm: this.options.globalLimits?.tpm ?? 50_000_000,
      concurrentRequests: this.options.globalLimits?.concurrentRequests ?? 5_000,
      concurrentStreams: this.options.globalLimits?.concurrentStreams ?? 2_000,
    });

    const effectiveOrg = this.mergeDefaults(orgLimits, "organization", request.organizationId, {
      rpm: this.options.defaultOrgLimits?.rpm ?? 2_000,
      tpm: this.options.defaultOrgLimits?.tpm ?? 2_000_000,
      concurrentRequests: this.options.defaultOrgLimits?.concurrentRequests ?? 100,
      concurrentStreams: this.options.defaultOrgLimits?.concurrentStreams ?? 50,
    });

    const effectiveWs = this.mergeDefaults(wsLimits, "workspace", request.workspaceId, {
      rpm: this.options.defaultWorkspaceLimits?.rpm ?? 1_000,
      tpm: this.options.defaultWorkspaceLimits?.tpm ?? 1_000_000,
      concurrentRequests: this.options.defaultWorkspaceLimits?.concurrentRequests ?? 50,
      concurrentStreams: this.options.defaultWorkspaceLimits?.concurrentStreams ?? 25,
    });

    const allLimits: QuotaLimit[] = [
      ...effectiveGlobal,
      ...effectiveOrg,
      ...effectiveWs,
      ...keyLimits,
    ];

    // 2. Concurrency checks
    const concurrencyPermitIds: Array<{ key: string; permitId: string }> = [];

    // Check concurrency limits first
    for (const limit of allLimits) {
      if (limit.dimension === "concurrent_requests" && limit.limit > 0) {
        const concKey = `concurrency:${limit.scopeType}:${limit.scopeId}:requests`;
        const res = await this.counterStore.acquireConcurrencyPermit(
          concKey,
          limit.limit,
          this.leaseTtlSec,
          now
        );
        if (!res.acquired) {
          // Release any already acquired concurrency permits
          for (const p of concurrencyPermitIds) {
            await this.counterStore.releaseConcurrencyPermit(p.key, p.permitId);
          }

          const denialCode: QuotaDenialCode =
            limit.scopeType === "global" ? "global_overload" : "concurrency_limit_exceeded";

          return {
            decision: {
              allowed: false,
              denialCode,
              reason: `Concurrency limit exceeded on ${limit.scopeType} (${res.current} >= ${limit.limit})`,
              blockingScope: { scopeType: limit.scopeType, scopeId: limit.scopeId },
              blockingDimension: "concurrent_requests",
              limit: limit.limit,
              used: res.current,
              remaining: 0,
              retryAfterSeconds: 2,
            },
          };
        }
        concurrencyPermitIds.push({ key: concKey, permitId: res.permitId! });
      }

      if (request.stream && limit.dimension === "concurrent_streams" && limit.limit > 0) {
        const streamKey = `concurrency:${limit.scopeType}:${limit.scopeId}:streams`;
        const res = await this.counterStore.acquireConcurrencyPermit(
          streamKey,
          limit.limit,
          this.leaseTtlSec,
          now
        );
        if (!res.acquired) {
          // Release all acquired
          for (const p of concurrencyPermitIds) {
            await this.counterStore.releaseConcurrencyPermit(p.key, p.permitId);
          }

          return {
            decision: {
              allowed: false,
              denialCode: "concurrency_limit_exceeded",
              reason: `Concurrent streams limit exceeded on ${limit.scopeType} (${res.current} >= ${limit.limit})`,
              blockingScope: { scopeType: limit.scopeType, scopeId: limit.scopeId },
              blockingDimension: "concurrent_streams",
              limit: limit.limit,
              used: res.current,
              remaining: 0,
              retryAfterSeconds: 2,
            },
          };
        }
        concurrencyPermitIds.push({ key: streamKey, permitId: res.permitId! });
      }
    }

    // 3. Build sliding-window atomic reservations (RPM, TPM)
    const atomicReservations: AtomicReservationRequest[] = [];
    const reservedScopes: ReservedScopeAmount[] = [];

    for (const limit of allLimits) {
      if (limit.dimension === "requests") {
        const key = `ratelimit:${limit.scopeType}:${limit.scopeId}:requests:${limit.windowSeconds}`;
        atomicReservations.push({
          key,
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "requests",
          amount: 1,
          limit: limit.limit,
          windowSeconds: limit.windowSeconds,
          burst: limit.burst,
          hard: limit.hard,
        });
        reservedScopes.push({
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "requests",
          reservedAmount: 1,
          windowSeconds: limit.windowSeconds,
          counterKey: key,
        });
      }

      if (limit.dimension === "total_tokens" || limit.dimension === "input_tokens") {
        const amount =
          limit.dimension === "total_tokens"
            ? request.estimatedTokens.totalEstimatedTokens
            : request.estimatedTokens.inputTokens;

        const key = `ratelimit:${limit.scopeType}:${limit.scopeId}:tokens:${limit.windowSeconds}`;
        atomicReservations.push({
          key,
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: limit.dimension,
          amount,
          limit: limit.limit,
          windowSeconds: limit.windowSeconds,
          burst: limit.burst,
          hard: limit.hard,
        });
        reservedScopes.push({
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: limit.dimension,
          reservedAmount: amount,
          windowSeconds: limit.windowSeconds,
          counterKey: key,
        });
      }
    }

    // 4. Atomically evaluate and reserve
    const atomicResult = await this.counterStore.checkAndReserveAtomic(
      atomicReservations,
      now
    );

    if (!atomicResult.allowed) {
      // Rollback all concurrency leases
      for (const p of concurrencyPermitIds) {
        await this.counterStore.releaseConcurrencyPermit(p.key, p.permitId);
      }

      const blocking = atomicResult.blockingRequest!;
      const denialCode: QuotaDenialCode =
        blocking.scopeType === "global"
          ? "global_overload"
          : blocking.dimension === "requests"
          ? "rate_limit_exceeded"
          : "token_rate_limit_exceeded";

      const headers: Record<string, string> = {
        "x-ratelimit-limit-requests": String(blocking.limit),
        "x-ratelimit-remaining-requests": String(atomicResult.remaining ?? 0),
        "x-ratelimit-reset-requests": String(atomicResult.resetAt?.toISOString() ?? ""),
        "retry-after": String(atomicResult.retryAfterSeconds ?? 1),
      };

      return {
        decision: {
          allowed: false,
          denialCode,
          reason: `${denialCode.replace(/_/g, " ")} on ${blocking.scopeType} (${atomicResult.used} + ${blocking.amount} > ${blocking.limit})`,
          blockingScope: { scopeType: blocking.scopeType, scopeId: blocking.scopeId },
          blockingDimension: blocking.dimension,
          limit: blocking.limit,
          used: atomicResult.used,
          remaining: atomicResult.remaining,
          resetAt: atomicResult.resetAt,
          retryAfterSeconds: atomicResult.retryAfterSeconds,
          headers,
        },
      };
    }

    // 5. Successful Reservation Created
    const reservation: QuotaReservation = {
      reservationId,
      requestId,
      scopes: reservedScopes,
      reservedTokens: request.estimatedTokens.totalEstimatedTokens,
      reservedRequests: 1,
      holdsConcurrency: concurrencyPermitIds.some((p) => p.key.includes(":requests")),
      holdsStreamConcurrency: concurrencyPermitIds.some((p) => p.key.includes(":streams")),
      concurrencyKeys: concurrencyPermitIds.map((p) => `${p.key}:${p.permitId}`),
      expiresAt: new Date(now.getTime() + this.leaseTtlSec * 1000),
      status: "active",
      createdAt: now,
    };

    const headers: Record<string, string> = {
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-limit-tokens": "1000000",
      "x-ratelimit-remaining-tokens": "990000",
    };

    return {
      decision: {
        allowed: true,
        reservationId,
        headers,
      },
      reservation,
    };
  }

  /**
   * Evaluates and reserves capacity for an individual provider attempt (attempt 1, retry, fallback).
   */
  async evaluateAndReserveProviderAttempt(
    request: ProviderAttemptQuotaRequest
  ): Promise<{ decision: QuotaDecision; reservation?: QuotaReservation }> {
    const now = request.now ?? new Date();
    const requestId = request.requestId ?? `attempt_${randomUUID().slice(0, 12)}`;
    const reservationId = `pres_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // 1. Fetch Route & Provider Limits
    const routeLimits = await this.policyRepo.getLimitsForScope("provider_route", request.routeId);
    const provLimits = await this.policyRepo.getLimitsForScope("provider", request.providerId);

    const effectiveRouteLimits = this.mergeDefaults(
      routeLimits,
      "provider_route",
      request.routeId,
      {
        rpm: 1000,
        tpm: 1_000_000,
        concurrentRequests: 50,
        concurrentStreams: 25,
      }
    );

    const allLimits = [...effectiveRouteLimits, ...provLimits];

    // 2. Concurrency checks
    const concurrencyPermitIds: Array<{ key: string; permitId: string }> = [];

    for (const limit of allLimits) {
      if (limit.dimension === "concurrent_requests" && limit.limit > 0) {
        const concKey = `concurrency:${limit.scopeType}:${limit.scopeId}:requests`;
        const res = await this.counterStore.acquireConcurrencyPermit(
          concKey,
          limit.limit,
          this.leaseTtlSec,
          now
        );
        if (!res.acquired) {
          for (const p of concurrencyPermitIds) {
            await this.counterStore.releaseConcurrencyPermit(p.key, p.permitId);
          }
          return {
            decision: {
              allowed: false,
              denialCode: "provider_capacity_exhausted",
              reason: `Provider route concurrency limit reached (${res.current} >= ${limit.limit})`,
              blockingScope: { scopeType: limit.scopeType, scopeId: limit.scopeId },
              blockingDimension: "concurrent_requests",
              limit: limit.limit,
              used: res.current,
              remaining: 0,
            },
          };
        }
        concurrencyPermitIds.push({ key: concKey, permitId: res.permitId! });
      }
    }

    // 3. Sliding window reservations (RPM & TPM per attempt)
    const atomicReservations: AtomicReservationRequest[] = [];
    const reservedScopes: ReservedScopeAmount[] = [];

    for (const limit of allLimits) {
      if (limit.dimension === "requests") {
        const key = `ratelimit:${limit.scopeType}:${limit.scopeId}:requests:${limit.windowSeconds}`;
        atomicReservations.push({
          key,
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "requests",
          amount: 1,
          limit: limit.limit,
          windowSeconds: limit.windowSeconds,
          burst: limit.burst,
          hard: limit.hard,
        });
        reservedScopes.push({
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "requests",
          reservedAmount: 1,
          windowSeconds: limit.windowSeconds,
          counterKey: key,
        });
      }

      if (limit.dimension === "total_tokens") {
        const amount = request.estimatedTokens.totalEstimatedTokens;
        const key = `ratelimit:${limit.scopeType}:${limit.scopeId}:tokens:${limit.windowSeconds}`;
        atomicReservations.push({
          key,
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "total_tokens",
          amount,
          limit: limit.limit,
          windowSeconds: limit.windowSeconds,
          burst: limit.burst,
          hard: limit.hard,
        });
        reservedScopes.push({
          scopeType: limit.scopeType,
          scopeId: limit.scopeId,
          dimension: "total_tokens",
          reservedAmount: amount,
          windowSeconds: limit.windowSeconds,
          counterKey: key,
        });
      }
    }

    const atomicResult = await this.counterStore.checkAndReserveAtomic(
      atomicReservations,
      now
    );

    if (!atomicResult.allowed) {
      for (const p of concurrencyPermitIds) {
        await this.counterStore.releaseConcurrencyPermit(p.key, p.permitId);
      }
      return {
        decision: {
          allowed: false,
          denialCode: "provider_capacity_exhausted",
          reason: `Provider route rate or token limit exhausted`,
          blockingScope: atomicResult.blockingRequest
            ? { scopeType: atomicResult.blockingRequest.scopeType, scopeId: atomicResult.blockingRequest.scopeId }
            : undefined,
          blockingDimension: atomicResult.blockingRequest?.dimension,
          limit: atomicResult.blockingRequest?.limit,
          used: atomicResult.used,
          remaining: atomicResult.remaining,
        },
      };
    }

    const reservation: QuotaReservation = {
      reservationId,
      requestId,
      scopes: reservedScopes,
      reservedTokens: request.estimatedTokens.totalEstimatedTokens,
      reservedRequests: 1,
      holdsConcurrency: concurrencyPermitIds.length > 0,
      holdsStreamConcurrency: false,
      concurrencyKeys: concurrencyPermitIds.map((p) => `${p.key}:${p.permitId}`),
      expiresAt: new Date(now.getTime() + this.leaseTtlSec * 1000),
      status: "active",
      createdAt: now,
    };

    return {
      decision: {
        allowed: true,
        reservationId,
      },
      reservation,
    };
  }

  /**
   * Finalizes a reservation when request or attempt completes.
   * Reconciles estimated vs actual token usage and releases concurrency permits.
   */
  async finalizeReservation(
    reservation: QuotaReservation,
    actualTokens?: { inputTokens: number; outputTokens: number; totalTokens: number },
    now = new Date()
  ): Promise<void> {
    if (reservation.status !== "active") return;

    // 1. Reconcile tokens if actual usage is reported
    if (actualTokens) {
      for (const scope of reservation.scopes) {
        if (scope.dimension === "total_tokens" || scope.dimension === "input_tokens") {
          const actual =
            scope.dimension === "total_tokens"
              ? actualTokens.totalTokens
              : actualTokens.inputTokens;

          await this.counterStore.finalizeTokens(
            scope.counterKey,
            scope.windowSeconds,
            scope.reservedAmount,
            actual,
            now
          );
        }
      }
    }

    // 2. Release concurrency leases
    for (const entry of reservation.concurrencyKeys) {
      const lastColon = entry.lastIndexOf(":");
      const key = entry.slice(0, lastColon);
      const permitId = entry.slice(lastColon + 1);
      await this.counterStore.releaseConcurrencyPermit(key, permitId);
    }

    reservation.status = "finalized";
  }

  /**
   * Cancels/rolls back reservation on failure or rejection.
   */
  async cancelReservation(
    reservation: QuotaReservation,
    now = new Date()
  ): Promise<void> {
    if (reservation.status !== "active") return;

    await this.counterStore.rollbackReservation(reservation.scopes, now);

    for (const entry of reservation.concurrencyKeys) {
      const lastColon = entry.lastIndexOf(":");
      const key = entry.slice(0, lastColon);
      const permitId = entry.slice(lastColon + 1);
      await this.counterStore.releaseConcurrencyPermit(key, permitId);
    }

    reservation.status = "cancelled";
  }

  /**
   * Heartbeat to renew concurrency lease for long-lived streams.
   */
  async heartbeatLease(
    reservation: QuotaReservation,
    ttlSeconds = this.leaseTtlSec,
    now = new Date()
  ): Promise<boolean> {
    if (reservation.status !== "active") return false;

    let allRenewed = true;
    for (const entry of reservation.concurrencyKeys) {
      const lastColon = entry.lastIndexOf(":");
      const key = entry.slice(0, lastColon);
      const permitId = entry.slice(lastColon + 1);
      const renewed = await this.counterStore.renewConcurrencyPermit(
        key,
        permitId,
        ttlSeconds,
        now
      );
      if (!renewed) allRenewed = false;
    }

    if (allRenewed) {
      reservation.expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    }
    return allRenewed;
  }

  private mergeDefaults(
    existing: QuotaLimit[],
    scopeType: QuotaScopeType,
    scopeId: string,
    defaults: {
      rpm: number;
      tpm: number;
      concurrentRequests: number;
      concurrentStreams: number;
    }
  ): QuotaLimit[] {
    const list = [...existing];
    if (!list.some((l) => l.dimension === "requests")) {
      list.push({
        scopeType,
        scopeId,
        dimension: "requests",
        windowSeconds: 60,
        limit: defaults.rpm,
        hard: true,
        enabled: true,
        source: "default",
      });
    }
    if (!list.some((l) => l.dimension === "total_tokens")) {
      list.push({
        scopeType,
        scopeId,
        dimension: "total_tokens",
        windowSeconds: 60,
        limit: defaults.tpm,
        hard: true,
        enabled: true,
        source: "default",
      });
    }
    if (!list.some((l) => l.dimension === "concurrent_requests")) {
      list.push({
        scopeType,
        scopeId,
        dimension: "concurrent_requests",
        windowSeconds: 0,
        limit: defaults.concurrentRequests,
        hard: true,
        enabled: true,
        source: "default",
      });
    }
    if (!list.some((l) => l.dimension === "concurrent_streams")) {
      list.push({
        scopeType,
        scopeId,
        dimension: "concurrent_streams",
        windowSeconds: 0,
        limit: defaults.concurrentStreams,
        hard: true,
        enabled: true,
        source: "default",
      });
    }
    return list;
  }
}
