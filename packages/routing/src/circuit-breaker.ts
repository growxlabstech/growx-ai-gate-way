import { randomUUID } from "node:crypto";
import type {
  CircuitConfiguration,
  CircuitState,
  ExecutionPermit,
  HealthOutcomeSignal,
  ManualCircuitOverride,
  RouteHealthSnapshot,
  RouteHealthState,
} from "./health-types.js";
import { DEFAULT_CIRCUIT_CONFIG } from "./health-types.js";
import { SlidingWindowTracker } from "./rolling-window.js";

export interface CircuitStateTransition {
  routeId: string;
  previousState: CircuitState;
  newState: CircuitState;
  reason: string;
  failureRate?: number | undefined;
  sampleCount?: number | undefined;
  timestamp: Date;
}

export class RouteCircuitBreaker {
  public readonly tracker: SlidingWindowTracker;
  private circuitState: CircuitState = "CLOSED";
  private openedAt: Date | null = null;
  private openCooldownMs: number;
  private reopenCount = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private activePermits = new Map<string, number>(); // permitId -> expiresAt ms
  private manualOverride: ManualCircuitOverride | null = null;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private lastProbeAt: Date | null = null;

  constructor(
    public readonly routeId: string,
    public readonly providerId: string,
    public readonly config: CircuitConfiguration = DEFAULT_CIRCUIT_CONFIG,
    public readonly region?: string | undefined,
    public readonly providerModelId?: string | undefined,
  ) {
    this.tracker = new SlidingWindowTracker(60_000, 5_000);
    this.openCooldownMs = config.openDurationMs;
  }

  /**
   * Cleans expired active permits.
   */
  private cleanExpiredPermits(nowMs: number): void {
    for (const [permitId, expiresAt] of this.activePermits.entries()) {
      if (nowMs > expiresAt) {
        this.activePermits.delete(permitId);
      }
    }
  }

  /**
   * Checks whether a manual override is active or has expired.
   */
  private getActiveOverride(now: Date): ManualCircuitOverride | null {
    if (!this.manualOverride) return null;
    if (
      this.manualOverride.expiresAt &&
      now.getTime() > this.manualOverride.expiresAt.getTime()
    ) {
      this.manualOverride = null;
      return null;
    }
    return this.manualOverride;
  }

  /**
   * Computes the current effective circuit state (handling cooldown expiration).
   */
  getCurrentCircuitState(now = new Date()): {
    state: CircuitState;
    transition?: CircuitStateTransition | undefined;
  } {
    const override = this.getActiveOverride(now);
    if (override) {
      return { state: override.state };
    }

    if (this.circuitState === "OPEN") {
      if (
        this.openedAt &&
        now.getTime() - this.openedAt.getTime() >= this.openCooldownMs
      ) {
        const previousState = this.circuitState;
        this.circuitState = "HALF_OPEN";
        this.consecutiveSuccesses = 0;
        return {
          state: "HALF_OPEN",
          transition: {
            routeId: this.routeId,
            previousState,
            newState: "HALF_OPEN",
            reason: `Cooldown of ${this.openCooldownMs}ms expired`,
            timestamp: now,
          },
        };
      }
      return { state: "OPEN" };
    }

    return { state: this.circuitState };
  }

  /**
   * Evaluates overall route health state: healthy | degraded | unhealthy | unknown
   */
  evaluateHealthState(now = new Date()): RouteHealthState {
    const { state: currentCircuit } = this.getCurrentCircuitState(now);
    if (currentCircuit === "OPEN" || currentCircuit === "FORCED_OPEN") {
      return "unhealthy";
    }

    const summary = this.tracker.getSummary(now.getTime());
    if (summary.sampleCount === 0) {
      return this.consecutiveSuccesses > 0 ? "healthy" : "unknown";
    }

    if (this.consecutiveFailures >= this.config.consecutiveFailureThreshold) {
      return "unhealthy";
    }

    if (summary.sampleCount >= this.config.minimumSampleSize) {
      if (summary.errorRate >= this.config.failureRateThreshold) {
        return "unhealthy";
      }
      if (
        summary.errorRate >= this.config.degradedErrorRateThreshold ||
        summary.timeoutRate >= 0.2 ||
        summary.rateLimitRate >= this.config.rateLimitRateThreshold
      ) {
        return "degraded";
      }
    } else if (summary.errorRate > 0) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Calculates a normalized 0..100 availability score for candidate ranking.
   */
  calculateAvailabilityScore(now = new Date()): number {
    const { state: currentCircuit } = this.getCurrentCircuitState(now);
    if (currentCircuit === "OPEN" || currentCircuit === "FORCED_OPEN") {
      return 0;
    }
    if (currentCircuit === "HALF_OPEN") {
      return 45;
    }

    const summary = this.tracker.getSummary(now.getTime());
    if (summary.sampleCount === 0) {
      return 85; // Neutral baseline for new routes
    }

    let score = summary.successRate * 100;

    // Penalties for 429 pressure and timeouts
    if (summary.rateLimitRate > 0) {
      score -= summary.rateLimitRate * 30;
    }
    if (summary.timeoutRate > 0) {
      score -= summary.timeoutRate * 40;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Requests an execution permit for a request attempt.
   */
  acquirePermit(now = new Date()): {
    permit: ExecutionPermit;
    transition?: CircuitStateTransition | undefined;
  } {
    const nowMs = now.getTime();
    this.cleanExpiredPermits(nowMs);

    const { state: currentCircuit, transition } =
      this.getCurrentCircuitState(now);

    if (currentCircuit === "FORCED_OPEN" || currentCircuit === "OPEN") {
      return {
        permit: {
          allowed: false,
          circuitState: currentCircuit,
          reason: "CIRCUIT_OPEN",
        },
        transition,
      };
    }

    if (currentCircuit === "FORCED_CLOSED" || currentCircuit === "CLOSED") {
      return {
        permit: {
          allowed: true,
          circuitState: currentCircuit,
        },
        transition,
      };
    }

    // HALF_OPEN state -> check concurrency limit
    if (currentCircuit === "HALF_OPEN") {
      if (this.activePermits.size < this.config.halfOpenMaxConcurrent) {
        const permitId = `pmt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        this.activePermits.set(permitId, nowMs + this.config.permitTtlMs);
        return {
          permit: {
            allowed: true,
            circuitState: "HALF_OPEN",
            permitId,
          },
          transition,
        };
      }
      return {
        permit: {
          allowed: false,
          circuitState: "HALF_OPEN",
          reason: "HALF_OPEN_CONCURRENCY_LIMIT",
        },
        transition,
      };
    }

    return {
      permit: { allowed: true, circuitState: currentCircuit },
      transition,
    };
  }

  /**
   * Records a terminal attempt outcome and processes circuit state transitions.
   */
  recordOutcome(
    signal: HealthOutcomeSignal,
    latencyMs?: number,
    permitId?: string,
    now = new Date(),
  ): { transition?: CircuitStateTransition | undefined } {
    const nowMs = now.getTime();

    // Release permit if one was held
    if (permitId) {
      this.activePermits.delete(permitId);
    }
    this.cleanExpiredPermits(nowMs);

    // Track signal in rolling window
    this.tracker.recordSignal(signal, latencyMs, nowMs);

    const isSuccess = signal === "success";
    const isQualifyingFailure =
      signal === "error_5xx" ||
      signal === "timeout" ||
      signal === "network_error";

    if (isSuccess) {
      this.lastSuccessAt = now;
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses++;
    } else if (isQualifyingFailure) {
      this.lastFailureAt = now;
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures++;
    }

    const { state: currentCircuit } = this.getCurrentCircuitState(now);

    // If circuit is in HALF_OPEN
    if (currentCircuit === "HALF_OPEN") {
      if (isQualifyingFailure) {
        // Reopen circuit with exponential cooldown backoff
        this.reopenCount++;
        this.openCooldownMs = Math.min(
          this.config.openDurationMs *
            Math.pow(2, Math.min(this.reopenCount, 4)),
          this.config.maxOpenDurationMs,
        );
        const previousState = this.circuitState;
        this.circuitState = "OPEN";
        this.openedAt = now;
        this.consecutiveSuccesses = 0;

        return {
          transition: {
            routeId: this.routeId,
            previousState,
            newState: "OPEN",
            reason: `Failure during HALF_OPEN probe: ${signal} (cooldown: ${this.openCooldownMs}ms)`,
            timestamp: now,
          },
        };
      }

      if (
        isSuccess &&
        this.consecutiveSuccesses >= this.config.halfOpenRequiredSuccesses
      ) {
        // Recover to CLOSED
        const previousState = this.circuitState;
        this.circuitState = "CLOSED";
        this.openedAt = null;
        this.openCooldownMs = this.config.openDurationMs;
        this.reopenCount = 0;
        this.consecutiveFailures = 0;
        this.tracker.reset();
        this.tracker.recordSignal("success", latencyMs, nowMs);

        return {
          transition: {
            routeId: this.routeId,
            previousState,
            newState: "CLOSED",
            reason: `Recovered: ${this.consecutiveSuccesses} consecutive successful probes`,
            timestamp: now,
          },
        };
      }

      return {};
    }

    // If circuit is in CLOSED
    if (currentCircuit === "CLOSED") {
      const summary = this.tracker.getSummary(nowMs);

      // Check consecutive failure threshold
      if (this.consecutiveFailures >= this.config.consecutiveFailureThreshold) {
        const previousState = this.circuitState;
        this.circuitState = "OPEN";
        this.openedAt = now;

        return {
          transition: {
            routeId: this.routeId,
            previousState,
            newState: "OPEN",
            reason: `Breached consecutive failure threshold (${this.consecutiveFailures} failures)`,
            failureRate: summary.errorRate,
            sampleCount: summary.sampleCount,
            timestamp: now,
          },
        };
      }

      // Check minimum sample and error rate thresholds
      if (summary.sampleCount >= this.config.minimumSampleSize) {
        if (summary.errorRate >= this.config.failureRateThreshold) {
          const previousState = this.circuitState;
          this.circuitState = "OPEN";
          this.openedAt = now;

          return {
            transition: {
              routeId: this.routeId,
              previousState,
              newState: "OPEN",
              reason: `Breached failure rate threshold (${Math.round(summary.errorRate * 100)}% >= ${Math.round(this.config.failureRateThreshold * 100)}%)`,
              failureRate: summary.errorRate,
              sampleCount: summary.sampleCount,
              timestamp: now,
            },
          };
        }

        if (summary.timeoutRate >= this.config.timeoutRateThreshold) {
          const previousState = this.circuitState;
          this.circuitState = "OPEN";
          this.openedAt = now;

          return {
            transition: {
              routeId: this.routeId,
              previousState,
              newState: "OPEN",
              reason: `Breached timeout rate threshold (${Math.round(summary.timeoutRate * 100)}% >= ${Math.round(this.config.timeoutRateThreshold * 100)}%)`,
              failureRate: summary.timeoutRate,
              sampleCount: summary.sampleCount,
              timestamp: now,
            },
          };
        }
      }
    }

    return {};
  }

  /**
   * Records active health probe execution.
   */
  recordProbe(
    healthy: boolean,
    latencyMs?: number,
    now = new Date(),
  ): { transition?: CircuitStateTransition | undefined } {
    this.lastProbeAt = now;
    return this.recordOutcome(
      healthy ? "success" : "error_5xx",
      latencyMs,
      undefined,
      now,
    );
  }

  /**
   * Privileged manual force open.
   */
  forceOpen(
    reason: string,
    setBy: string,
    expiresAt?: Date | null,
  ): CircuitStateTransition {
    const previousState = this.circuitState;
    this.manualOverride = {
      state: "FORCED_OPEN",
      reason,
      setBy,
      setAt: new Date(),
      expiresAt,
    };
    return {
      routeId: this.routeId,
      previousState,
      newState: "FORCED_OPEN",
      reason: `Manual force open by ${setBy}: ${reason}`,
      timestamp: new Date(),
    };
  }

  /**
   * Privileged manual force close.
   */
  forceClose(
    reason: string,
    setBy: string,
    expiresAt?: Date | null,
  ): CircuitStateTransition {
    const previousState = this.circuitState;
    this.manualOverride = {
      state: "FORCED_CLOSED",
      reason,
      setBy,
      setAt: new Date(),
      expiresAt,
    };
    return {
      routeId: this.routeId,
      previousState,
      newState: "FORCED_CLOSED",
      reason: `Manual force close by ${setBy}: ${reason}`,
      timestamp: new Date(),
    };
  }

  /**
   * Privileged manual recovery -> sets circuit to HALF_OPEN to initiate safe probe testing.
   */
  recover(setBy: string): CircuitStateTransition {
    const previousState = this.circuitState;
    this.manualOverride = null;
    this.circuitState = "HALF_OPEN";
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.openedAt = null;

    return {
      routeId: this.routeId,
      previousState,
      newState: "HALF_OPEN",
      reason: `Manual recovery initiated by ${setBy}`,
      timestamp: new Date(),
    };
  }

  /**
   * Resets circuit state back to initial CLOSED state.
   */
  reset(): CircuitStateTransition {
    const previousState = this.circuitState;
    this.manualOverride = null;
    this.circuitState = "CLOSED";
    this.openedAt = null;
    this.openCooldownMs = this.config.openDurationMs;
    this.reopenCount = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.activePermits.clear();
    this.tracker.reset();

    return {
      routeId: this.routeId,
      previousState,
      newState: "CLOSED",
      reason: "Circuit reset to initial state",
      timestamp: new Date(),
    };
  }

  /**
   * Produces an immutable RouteHealthSnapshot.
   */
  getSnapshot(now = new Date()): RouteHealthSnapshot {
    const nowMs = now.getTime();
    this.cleanExpiredPermits(nowMs);
    const summary = this.tracker.getSummary(nowMs);
    const { state: currentCircuit } = this.getCurrentCircuitState(now);
    const healthState = this.evaluateHealthState(now);
    const availabilityScore = this.calculateAvailabilityScore(now);

    return {
      routeId: this.routeId,
      providerId: this.providerId,
      providerModelId: this.providerModelId,
      region: this.region,
      state: healthState,
      availabilityScore,
      successRate: summary.successRate,
      errorRate: summary.errorRate,
      timeoutRate: summary.timeoutRate,
      rateLimitRate: summary.rateLimitRate,
      sampleCount: summary.sampleCount,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      latency: summary.latency,
      circuitState: currentCircuit,
      openedAt: this.openedAt,
      openCooldownMs: this.openCooldownMs,
      reopenCount: this.reopenCount,
      activePermits: this.activePermits.size,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastProbeAt: this.lastProbeAt,
      manualOverride: this.manualOverride,
      updatedAt: now,
    };
  }
}
