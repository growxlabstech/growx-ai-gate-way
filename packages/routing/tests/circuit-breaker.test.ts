import { describe, expect, it } from "vitest";
import {
  DEFAULT_CIRCUIT_CONFIG,
  InMemoryRouteHealthStore,
  RouteCircuitBreaker,
  SlidingWindowTracker,
} from "../src/index.js";

describe("Phase 10 — SlidingWindowTracker", () => {
  it("tracks successes, errors, and computes accurate rates", () => {
    const tracker = new SlidingWindowTracker(60_000, 5_000);
    const now = Date.now();

    tracker.recordSignal("success", 100, now);
    tracker.recordSignal("success", 120, now);
    tracker.recordSignal("error_5xx", 500, now);
    tracker.recordSignal("timeout", 1000, now);
    tracker.recordSignal("rate_limit_429", 50, now);

    const summary = tracker.getSummary(now);
    expect(summary.sampleCount).toBe(5);
    expect(summary.successes).toBe(2);
    expect(summary.errors5xx).toBe(1);
    expect(summary.timeouts).toBe(1);
    expect(summary.rateLimits429).toBe(1);
    expect(summary.infrastructureFailures).toBe(2); // 5xx + timeout
    expect(summary.errorRate).toBe(0.4); // 2 / 5
    expect(summary.successRate).toBe(0.4); // 2 / 5
    expect(summary.latency.sampleCount).toBe(5);
    expect(summary.latency.p50LatencyMs).toBeDefined();
  });

  it("strictly excludes client cancellations, bad requests, and content rejections from provider health metrics", () => {
    const tracker = new SlidingWindowTracker(60_000, 5_000);
    const now = Date.now();

    tracker.recordSignal("client_cancelled", undefined, now);
    tracker.recordSignal("bad_request", undefined, now);
    tracker.recordSignal("content_rejected", undefined, now);

    const summary = tracker.getSummary(now);
    expect(summary.sampleCount).toBe(0);
    expect(summary.errorRate).toBe(0);
    expect(summary.infrastructureFailures).toBe(0);
  });
});

describe("Phase 10 — RouteCircuitBreaker", () => {
  it("starts in CLOSED state with neutral availability score (85)", () => {
    const breaker = new RouteCircuitBreaker("r_1", "p_openai");
    const snapshot = breaker.getSnapshot();

    expect(snapshot.circuitState).toBe("CLOSED");
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.availabilityScore).toBe(85);

    const { permit } = breaker.acquirePermit();
    expect(permit.allowed).toBe(true);
    expect(permit.circuitState).toBe("CLOSED");
  });

  it("does NOT open circuit on 1 isolated failure below minimumSampleSize", () => {
    const breaker = new RouteCircuitBreaker("r_1", "p_openai", {
      ...DEFAULT_CIRCUIT_CONFIG,
      minimumSampleSize: 5,
      consecutiveFailureThreshold: 3,
    });

    const result = breaker.recordOutcome("error_5xx");
    expect(result.transition).toBeUndefined();

    const snapshot = breaker.getSnapshot();
    expect(snapshot.circuitState).toBe("CLOSED");
  });

  it("opens immediately when consecutiveFailureThreshold is reached", () => {
    const breaker = new RouteCircuitBreaker("r_1", "p_openai", {
      ...DEFAULT_CIRCUIT_CONFIG,
      consecutiveFailureThreshold: 3,
    });

    breaker.recordOutcome("error_5xx");
    breaker.recordOutcome("timeout");
    const result = breaker.recordOutcome("network_error");

    expect(result.transition).toBeDefined();
    expect(result.transition?.newState).toBe("OPEN");

    const snapshot = breaker.getSnapshot();
    expect(snapshot.circuitState).toBe("OPEN");
    expect(snapshot.state).toBe("unhealthy");
    expect(snapshot.availabilityScore).toBe(0);

    const { permit } = breaker.acquirePermit();
    expect(permit.allowed).toBe(false);
    expect(permit.reason).toBe("CIRCUIT_OPEN");
  });

  it("opens when failureRateThreshold is breached with sufficient samples", () => {
    const breaker = new RouteCircuitBreaker("r_1", "p_openai", {
      ...DEFAULT_CIRCUIT_CONFIG,
      minimumSampleSize: 4,
      failureRateThreshold: 0.5,
      consecutiveFailureThreshold: 10,
    });

    breaker.recordOutcome("success");
    breaker.recordOutcome("error_5xx");
    breaker.recordOutcome("success");
    const res = breaker.recordOutcome("error_5xx"); // 2/4 = 50%

    expect(res.transition?.newState).toBe("OPEN");
    expect(breaker.getSnapshot().circuitState).toBe("OPEN");
  });

  it("cooldown transitions OPEN -> HALF_OPEN, permits limited test traffic, and recovers to CLOSED on required successes", () => {
    const now = Date.now();
    const breaker = new RouteCircuitBreaker("r_1", "p_openai", {
      ...DEFAULT_CIRCUIT_CONFIG,
      openDurationMs: 1000,
      halfOpenMaxConcurrent: 1,
      halfOpenRequiredSuccesses: 2,
      consecutiveFailureThreshold: 2,
    });

    // 1. Force open via consecutive failures
    breaker.recordOutcome("error_5xx", undefined, undefined, new Date(now));
    breaker.recordOutcome("error_5xx", undefined, undefined, new Date(now));
    expect(breaker.getSnapshot(new Date(now)).circuitState).toBe("OPEN");

    // 2. Before cooldown expires -> still OPEN, permits denied
    const denied = breaker.acquirePermit(new Date(now + 500));
    expect(denied.permit.allowed).toBe(false);

    // 3. After cooldown (1000ms) -> transitions to HALF_OPEN
    const allowedProbe1 = breaker.acquirePermit(new Date(now + 1100));
    expect(allowedProbe1.permit.allowed).toBe(true);
    expect(allowedProbe1.permit.circuitState).toBe("HALF_OPEN");
    expect(allowedProbe1.permit.permitId).toBeDefined();

    // 4. Concurrent probe 2 denied (halfOpenMaxConcurrent = 1)
    const deniedProbe2 = breaker.acquirePermit(new Date(now + 1150));
    expect(deniedProbe2.permit.allowed).toBe(false);
    expect(deniedProbe2.permit.reason).toBe("HALF_OPEN_CONCURRENCY_LIMIT");

    // 5. Successful Probe 1 recorded
    breaker.recordOutcome("success", 100, allowedProbe1.permit.permitId, new Date(now + 1200));

    // Still HALF_OPEN because required successes = 2
    expect(breaker.getSnapshot(new Date(now + 1200)).circuitState).toBe("HALF_OPEN");

    // 6. Probe 2 acquired and succeeds -> transitions to CLOSED
    const allowedProbe2 = breaker.acquirePermit(new Date(now + 1300));
    const recoveryRes = breaker.recordOutcome("success", 95, allowedProbe2.permit.permitId, new Date(now + 1400));

    expect(recoveryRes.transition?.newState).toBe("CLOSED");
    expect(breaker.getSnapshot(new Date(now + 1400)).circuitState).toBe("CLOSED");
    expect(breaker.getSnapshot(new Date(now + 1400)).state).toBe("healthy");
  });

  it("qualifying failure during HALF_OPEN immediately reopens circuit with exponential backoff", () => {
    const now = Date.now();
    const breaker = new RouteCircuitBreaker("r_1", "p_openai", {
      ...DEFAULT_CIRCUIT_CONFIG,
      openDurationMs: 1000,
      maxOpenDurationMs: 10000,
      consecutiveFailureThreshold: 1,
    });

    // Open circuit
    breaker.recordOutcome("error_5xx", undefined, undefined, new Date(now));
    expect(breaker.getSnapshot(new Date(now)).circuitState).toBe("OPEN");

    // Cooldown expires -> HALF_OPEN
    const permit = breaker.acquirePermit(new Date(now + 1100));
    expect(permit.permit.allowed).toBe(true);
    expect(permit.permit.circuitState).toBe("HALF_OPEN");

    // Probe fails -> immediately reopens with backoff cooldown (2000ms)
    const reopenRes = breaker.recordOutcome("error_5xx", undefined, permit.permit.permitId, new Date(now + 1200));
    expect(reopenRes.transition?.newState).toBe("OPEN");

    const snapshot = breaker.getSnapshot(new Date(now + 1200));
    expect(snapshot.circuitState).toBe("OPEN");
    expect(snapshot.reopenCount).toBe(1);
    expect(snapshot.openCooldownMs).toBe(2000);
  });

  it("supports privileged manual force open and force close with expiration", () => {
    const now = Date.now();
    const breaker = new RouteCircuitBreaker("r_1", "p_openai");

    // Force Open
    const exp = new Date(now + 5000);
    const trans = breaker.forceOpen("Under maintenance", "admin_ops", exp);
    expect(trans.newState).toBe("FORCED_OPEN");

    const snapshot = breaker.getSnapshot(new Date(now + 1000));
    expect(snapshot.circuitState).toBe("FORCED_OPEN");
    expect(breaker.acquirePermit(new Date(now + 1000)).permit.allowed).toBe(false);

    // After expiration -> reverts to normal state
    const afterExpSnapshot = breaker.getSnapshot(new Date(now + 6000));
    expect(afterExpSnapshot.circuitState).toBe("CLOSED");
    expect(breaker.acquirePermit(new Date(now + 6000)).permit.allowed).toBe(true);
  });
});

describe("Phase 10 — InMemoryRouteHealthStore", () => {
  it("manages batch health retrieval, aggregate provider health, and transitions", async () => {
    const store = new InMemoryRouteHealthStore({
      ...DEFAULT_CIRCUIT_CONFIG,
      consecutiveFailureThreshold: 2,
    });

    // 1. Record healthy route r_1
    await store.recordRouteOutcome({
      routeId: "r_1",
      providerId: "openai",
      signal: "success",
      latencyMs: 50,
    });

    // 2. Record failing route r_2
    await store.recordRouteOutcome({
      routeId: "r_2",
      providerId: "openai",
      signal: "error_5xx",
    });
    const trans = await store.recordRouteOutcome({
      routeId: "r_2",
      providerId: "openai",
      signal: "error_5xx",
    });
    expect(trans?.newState).toBe("OPEN");

    // 3. Batch lookup
    const batch = await store.getRouteHealthBatch(["r_1", "r_2", "r_3"]);
    expect(batch.get("r_1")?.circuitState).toBe("CLOSED");
    expect(batch.get("r_2")?.circuitState).toBe("OPEN");
    expect(batch.get("r_3")?.circuitState).toBe("CLOSED"); // unknown new route defaults to CLOSED

    // 4. Aggregate provider health
    const agg = await store.getAggregateProviderHealth("openai");
    expect(agg.totalRoutes).toBe(2);
    expect(agg.openRoutes).toBe(1);
    expect(agg.state).toBe("degraded");
  });
});
