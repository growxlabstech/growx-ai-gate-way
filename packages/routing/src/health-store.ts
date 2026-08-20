import type {
  CircuitConfiguration,
  ExecutionPermit,
  RouteHealthSnapshot,
  RouteHealthState,
  RouteOutcomeInput,
} from "./health-types.js";
import { DEFAULT_CIRCUIT_CONFIG } from "./health-types.js";
import { RouteCircuitBreaker, type CircuitStateTransition } from "./circuit-breaker.js";

export interface IRouteHealthStore {
  getRouteHealth(routeId: string, providerId?: string): Promise<RouteHealthSnapshot>;
  getRouteHealthBatch(routeIds: string[]): Promise<Map<string, RouteHealthSnapshot>>;
  acquireExecutionPermit(routeId: string, providerId: string): Promise<ExecutionPermit>;
  recordRouteOutcome(outcome: RouteOutcomeInput): Promise<CircuitStateTransition | null>;
  recordProbeOutcome(
    routeId: string,
    providerId: string,
    healthy: boolean,
    latencyMs?: number
  ): Promise<CircuitStateTransition | null>;
  setManualOverride(
    routeId: string,
    providerId: string,
    state: "FORCED_OPEN" | "FORCED_CLOSED",
    reason: string,
    setBy: string,
    expiresAt?: Date | null
  ): Promise<CircuitStateTransition>;
  recoverRoute(routeId: string, providerId: string, setBy: string): Promise<CircuitStateTransition>;
  resetRoute(routeId: string, providerId?: string): Promise<CircuitStateTransition>;
  listSnapshots(): Promise<RouteHealthSnapshot[]>;
  getAggregateProviderHealth(providerId: string): Promise<{
    providerId: string;
    state: RouteHealthState;
    score: number;
    openRoutes: number;
    totalRoutes: number;
  }>;
}

export class InMemoryRouteHealthStore implements IRouteHealthStore {
  private readonly breakers = new Map<string, RouteCircuitBreaker>();
  private readonly globalConfig: CircuitConfiguration;
  private readonly providerConfigs = new Map<string, Partial<CircuitConfiguration>>();
  private readonly routeConfigs = new Map<string, Partial<CircuitConfiguration>>();
  private readonly transitionsHistory: CircuitStateTransition[] = [];

  constructor(globalConfig: CircuitConfiguration = DEFAULT_CIRCUIT_CONFIG) {
    this.globalConfig = globalConfig;
  }

  setProviderConfig(providerId: string, config: Partial<CircuitConfiguration>): void {
    this.providerConfigs.set(providerId, config);
  }

  setRouteConfig(routeId: string, config: Partial<CircuitConfiguration>): void {
    this.routeConfigs.set(routeId, config);
  }

  private resolveEffectiveConfig(routeId: string, providerId?: string): CircuitConfiguration {
    const routeOverride = this.routeConfigs.get(routeId) ?? {};
    const providerOverride = providerId ? (this.providerConfigs.get(providerId) ?? {}) : {};

    return {
      ...this.globalConfig,
      ...providerOverride,
      ...routeOverride,
    };
  }

  private getOrCreateBreaker(routeId: string, providerId = "unknown"): RouteCircuitBreaker {
    let breaker = this.breakers.get(routeId);
    if (!breaker) {
      const config = this.resolveEffectiveConfig(routeId, providerId);
      breaker = new RouteCircuitBreaker(routeId, providerId, config);
      this.breakers.set(routeId, breaker);
    }
    return breaker;
  }

  async getRouteHealth(routeId: string, providerId?: string): Promise<RouteHealthSnapshot> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    return breaker.getSnapshot();
  }

  async getRouteHealthBatch(routeIds: string[]): Promise<Map<string, RouteHealthSnapshot>> {
    const result = new Map<string, RouteHealthSnapshot>();
    for (const routeId of routeIds) {
      const breaker = this.getOrCreateBreaker(routeId);
      result.set(routeId, breaker.getSnapshot());
    }
    return result;
  }

  async acquireExecutionPermit(routeId: string, providerId: string): Promise<ExecutionPermit> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    const { permit, transition } = breaker.acquirePermit();
    if (transition) {
      this.transitionsHistory.push(transition);
    }
    return permit;
  }

  async recordRouteOutcome(outcome: RouteOutcomeInput): Promise<CircuitStateTransition | null> {
    const breaker = this.getOrCreateBreaker(outcome.routeId, outcome.providerId);
    const { transition } = breaker.recordOutcome(
      outcome.signal,
      outcome.latencyMs,
      outcome.permitId,
      outcome.timestamp
    );
    if (transition) {
      this.transitionsHistory.push(transition);
      return transition;
    }
    return null;
  }

  async recordProbeOutcome(
    routeId: string,
    providerId: string,
    healthy: boolean,
    latencyMs?: number
  ): Promise<CircuitStateTransition | null> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    const { transition } = breaker.recordProbe(healthy, latencyMs);
    if (transition) {
      this.transitionsHistory.push(transition);
      return transition;
    }
    return null;
  }

  async setManualOverride(
    routeId: string,
    providerId: string,
    state: "FORCED_OPEN" | "FORCED_CLOSED",
    reason: string,
    setBy: string,
    expiresAt?: Date | null
  ): Promise<CircuitStateTransition> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    const transition =
      state === "FORCED_OPEN"
        ? breaker.forceOpen(reason, setBy, expiresAt)
        : breaker.forceClose(reason, setBy, expiresAt);

    this.transitionsHistory.push(transition);
    return transition;
  }

  async recoverRoute(
    routeId: string,
    providerId: string,
    setBy: string
  ): Promise<CircuitStateTransition> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    const transition = breaker.recover(setBy);
    this.transitionsHistory.push(transition);
    return transition;
  }

  async resetRoute(routeId: string, providerId?: string): Promise<CircuitStateTransition> {
    const breaker = this.getOrCreateBreaker(routeId, providerId);
    const transition = breaker.reset();
    this.transitionsHistory.push(transition);
    return transition;
  }

  async listSnapshots(): Promise<RouteHealthSnapshot[]> {
    return Array.from(this.breakers.values()).map((b) => b.getSnapshot());
  }

  getTransitionHistory(routeId?: string): CircuitStateTransition[] {
    if (routeId) {
      return this.transitionsHistory.filter((t) => t.routeId === routeId);
    }
    return [...this.transitionsHistory];
  }

  async getAggregateProviderHealth(providerId: string): Promise<{
    providerId: string;
    state: RouteHealthState;
    score: number;
    openRoutes: number;
    totalRoutes: number;
  }> {
    const routes = Array.from(this.breakers.values()).filter(
      (b) => b.providerId === providerId
    );

    if (routes.length === 0) {
      return {
        providerId,
        state: "unknown",
        score: 85,
        openRoutes: 0,
        totalRoutes: 0,
      };
    }

    const snapshots = routes.map((r) => r.getSnapshot());
    const openRoutes = snapshots.filter(
      (s) => s.circuitState === "OPEN" || s.circuitState === "FORCED_OPEN"
    ).length;
    const avgScore = Math.round(
      snapshots.reduce((acc, s) => acc + s.availabilityScore, 0) / snapshots.length
    );

    let state: RouteHealthState = "healthy";
    if (openRoutes === snapshots.length) {
      state = "unhealthy";
    } else if (openRoutes > 0 || avgScore < 70) {
      state = "degraded";
    }

    return {
      providerId,
      state,
      score: avgScore,
      openRoutes,
      totalRoutes: snapshots.length,
    };
  }
}
