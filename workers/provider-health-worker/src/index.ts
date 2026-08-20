import type { AIProviderAdapter, ProviderHealth } from "@growx/provider-sdk";
import type {
  CircuitStateTransition,
  IRouteHealthStore,
  RouteHealthSnapshot,
} from "@growx/routing";

export interface HealthTarget {
  providerId: string;
  adapter: AIProviderAdapter;
  baseUrl: string;
  credential: string;
}

export interface RouteHealthTarget {
  routeId: string;
  providerId: string;
  providerModelId?: string | undefined;
  region?: string | undefined;
  adapter: AIProviderAdapter;
  baseUrl: string;
  credential: string;
}

export interface HealthSink {
  save(providerId: string, health: ProviderHealth): Promise<void>;
  emitChanged(providerId: string, previous: string | null, current: string): Promise<void>;
  previous(providerId: string): Promise<string | null>;
}

export interface IProbeEventSink {
  emitRouteHealthChanged(
    routeId: string,
    providerId: string,
    previousState: string,
    currentState: string,
    snapshot: RouteHealthSnapshot
  ): Promise<void>;
  emitCircuitTransition(transition: CircuitStateTransition): Promise<void>;
}

export interface IDistributedLock {
  acquire(key: string, ttlMs: number): Promise<{ acquired: boolean; leaseId?: string }>;
  release(key: string, leaseId: string): Promise<void>;
}

export async function checkProviders(
  targets: readonly HealthTarget[],
  sink: HealthSink,
  signal: AbortSignal
) {
  for (const target of targets) {
    if (signal.aborted) break;

    let health: ProviderHealth;
    try {
      if (target.adapter.health) {
        health = await target.adapter.health({
          baseUrl: target.baseUrl,
          credential: target.credential,
          signal,
        });
      } else if (target.adapter.healthProbe) {
        health = await target.adapter.healthProbe({
          baseUrl: target.baseUrl,
          credential: target.credential,
          cancellationSignal: signal,
          timeoutMs: 5000,
        });
      } else {
        health = { state: "healthy", checkedAt: new Date().toISOString() };
      }
    } catch {
      health = { state: "unhealthy", checkedAt: new Date().toISOString() };
    }

    const previous = await sink.previous(target.providerId);
    await sink.save(target.providerId, health);
    if (previous !== health.state) {
      await sink.emitChanged(target.providerId, previous, health.state);
    }
  }
}

export interface ActiveProbeSchedulerOptions {
  probeIntervalMs?: number | undefined;
  probeTimeoutMs?: number | undefined;
  jitterMs?: number | undefined;
  lock?: IDistributedLock | undefined;
}

export class ActiveHealthProbeScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly probeIntervalMs: number;
  private readonly probeTimeoutMs: number;
  private readonly jitterMs: number;
  private readonly lock?: IDistributedLock | undefined;

  constructor(
    private readonly healthStore: IRouteHealthStore,
    private readonly eventSink?: IProbeEventSink | undefined,
    options: ActiveProbeSchedulerOptions = {}
  ) {
    this.probeIntervalMs = options.probeIntervalMs ?? 30_000;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 5_000;
    this.jitterMs = options.jitterMs ?? 2_000;
    this.lock = options.lock;
  }

  async probeSingleRoute(target: RouteHealthTarget, signal?: AbortSignal): Promise<void> {
    const lockKey = `probe:route:${target.routeId}`;
    let leaseId: string | undefined;

    if (this.lock) {
      const lockRes = await this.lock.acquire(lockKey, this.probeTimeoutMs + 2000);
      if (!lockRes.acquired) {
        return; // Another instance is probing this route
      }
      leaseId = lockRes.leaseId;
    }

    try {
      const abortController = new AbortController();
      if (signal) {
        signal.addEventListener("abort", () => abortController.abort(), { once: true });
      }

      const timer = setTimeout(() => {
        abortController.abort();
      }, this.probeTimeoutMs);

      const startTime = Date.now();
      let healthy = false;

      try {
        if (target.adapter.healthProbe) {
          const res = await target.adapter.healthProbe({
            baseUrl: target.baseUrl,
            credential: target.credential,
            cancellationSignal: abortController.signal,
            timeoutMs: this.probeTimeoutMs,
          });
          healthy = res.state === "healthy";
        } else if (target.adapter.health) {
          const res = await target.adapter.health({
            baseUrl: target.baseUrl,
            credential: target.credential,
            signal: abortController.signal,
          });
          healthy = res.state === "healthy";
        } else {
          healthy = true;
        }
      } catch {
        healthy = false;
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = Date.now() - startTime;
      const previousSnapshot = await this.healthStore.getRouteHealth(target.routeId, target.providerId);
      const transition = await this.healthStore.recordProbeOutcome(
        target.routeId,
        target.providerId,
        healthy,
        latencyMs
      );

      const currentSnapshot = await this.healthStore.getRouteHealth(target.routeId, target.providerId);

      if (this.eventSink) {
        if (transition) {
          await this.eventSink.emitCircuitTransition(transition).catch(() => {});
        }
        if (previousSnapshot.state !== currentSnapshot.state) {
          await this.eventSink
            .emitRouteHealthChanged(
              target.routeId,
              target.providerId,
              previousSnapshot.state,
              currentSnapshot.state,
              currentSnapshot
            )
            .catch(() => {});
        }
      }
    } finally {
      if (this.lock && leaseId) {
        await this.lock.release(lockKey, leaseId).catch(() => {});
      }
    }
  }

  async runProbeBatch(targets: readonly RouteHealthTarget[], signal?: AbortSignal): Promise<void> {
    for (const target of targets) {
      if (signal?.aborted) break;

      // Add small jitter between consecutive probes
      const jitter = Math.floor(Math.random() * (this.jitterMs + 1));
      if (jitter > 0) {
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }

      await this.probeSingleRoute(target, signal);
    }
  }

  start(getTargets: () => Promise<RouteHealthTarget[]>): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        const targets = await getTargets();
        await this.runProbeBatch(targets);
      } catch {
        // Suppress probe errors from killing loop
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(loop, this.probeIntervalMs);
        }
      }
    };

    void loop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
