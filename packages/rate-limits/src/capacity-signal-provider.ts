import type {
  CapacitySignalFeedback,
  CapacityState,
  RouteCapacitySignal,
} from "./types.js";
import type { IRuntimeCounterStore } from "./counter-store.js";
import type { IQuotaPolicyRepository } from "./quota-policy-store.js";

export interface IRouteCapacitySignalProvider {
  getCapacitySignal(
    routeId: string,
    providerId: string,
    now?: Date
  ): Promise<RouteCapacitySignal>;

  getCapacitySignals(
    routes: Array<{ routeId: string; providerId: string }>,
    now?: Date
  ): Promise<Map<string, RouteCapacitySignal>>;

  recordProviderFeedback(feedback: CapacitySignalFeedback, now?: Date): Promise<void>;
}

export class RouteCapacitySignalProvider implements IRouteCapacitySignalProvider {
  private readonly throttles = new Map<string, { throttledUntilMs: number }>();

  constructor(
    private readonly counterStore: IRuntimeCounterStore,
    private readonly policyRepo?: IQuotaPolicyRepository
  ) {}

  private getThrottleKey(routeId: string): string {
    return `throttle:route:${routeId}`;
  }

  async recordProviderFeedback(
    feedback: CapacitySignalFeedback,
    now = new Date()
  ): Promise<void> {
    const key = this.getThrottleKey(feedback.routeId);
    const nowMs = now.getTime();

    if (feedback.is429) {
      const cooldownSec = Math.max(5, feedback.retryAfterSeconds ?? 15);
      this.throttles.set(key, { throttledUntilMs: nowMs + cooldownSec * 1000 });
    }
  }

  async getCapacitySignal(
    routeId: string,
    providerId: string,
    now = new Date()
  ): Promise<RouteCapacitySignal> {
    const signals = await this.getCapacitySignals([{ routeId, providerId }], now);
    return signals.get(routeId)!;
  }

  async getCapacitySignals(
    routes: Array<{ routeId: string; providerId: string }>,
    now = new Date()
  ): Promise<Map<string, RouteCapacitySignal>> {
    const nowMs = now.getTime();
    const result = new Map<string, RouteCapacitySignal>();
    if (routes.length === 0) return result;

    const keys: string[] = [];
    for (const r of routes) {
      keys.push(`ratelimit:provider_route:${r.routeId}:requests:60`);
      keys.push(`ratelimit:provider_route:${r.routeId}:tokens:60`);
      keys.push(`concurrency:provider_route:${r.routeId}:requests`);
    }

    const metrics = await this.counterStore.getCapacityMetrics(keys, now);

    for (const r of routes) {
      const throttle = this.throttles.get(this.getThrottleKey(r.routeId));
      const isThrottled = throttle && throttle.throttledUntilMs > nowMs;

      // Default route limits if not explicitly configured in policy
      let rpmLimit = 1000;
      let tpmLimit = 1_000_000;
      let concurrencyLimit = 50;

      if (this.policyRepo) {
        const limits = await this.policyRepo.getLimitsForScope("provider_route", r.routeId);
        for (const l of limits) {
          if (l.dimension === "requests" && l.limit > 0) rpmLimit = l.limit;
          if (l.dimension === "total_tokens" && l.limit > 0) tpmLimit = l.limit;
          if (l.dimension === "concurrent_requests" && l.limit > 0) concurrencyLimit = l.limit;
        }
      }

      const rpmKey = `ratelimit:provider_route:${r.routeId}:requests:60`;
      const tpmKey = `ratelimit:provider_route:${r.routeId}:tokens:60`;
      const concKey = `concurrency:provider_route:${r.routeId}:requests`;

      const rpmMetric = metrics[rpmKey];
      const tpmMetric = metrics[tpmKey];
      const concMetric = metrics[concKey];

      const currentRPM = rpmMetric ? rpmMetric.used : 0;
      const currentTPM = tpmMetric ? tpmMetric.used : 0;
      const currentConc = concMetric ? concMetric.activeConcurrency : 0;

      const rpmUtil = rpmLimit > 0 ? currentRPM / rpmLimit : 0;
      const tpmUtil = tpmLimit > 0 ? currentTPM / tpmLimit : 0;
      const concUtil = concurrencyLimit > 0 ? currentConc / concurrencyLimit : 0;

      const maxUtil = Math.max(rpmUtil, tpmUtil, concUtil);
      const saturation = Math.min(1.0, maxUtil);
      const headroom = isThrottled ? 0 : Math.max(0, 1.0 - saturation);

      let state: CapacityState = "available";
      if (isThrottled || saturation >= 1.0) {
        state = "exhausted";
      } else if (saturation >= 0.85) {
        state = "near_limit";
      } else if (saturation >= 0.65) {
        state = "busy";
      }

      result.set(r.routeId, {
        routeId: r.routeId,
        providerId: r.providerId,
        headroom,
        saturation,
        state,
        estimatedRemainingRPM: Math.max(0, rpmLimit - currentRPM),
        estimatedRemainingTPM: Math.max(0, tpmLimit - currentTPM),
        activeConcurrency: currentConc,
        concurrencyLimit,
        rpmLimit,
        tpmLimit,
        updatedAt: now,
      });
    }

    return result;
  }
}
