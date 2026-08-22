import { describe, expect, it, vi } from "vitest";
import { MockAIProvider } from "@growx/testing";
import { InMemoryRouteHealthStore } from "@growx/routing";
import {
  ActiveHealthProbeScheduler,
  type IDistributedLock,
  type IProbeEventSink,
  type RouteHealthTarget,
} from "../src/index.js";

describe("Phase 10 — ActiveHealthProbeScheduler", () => {
  it("probes active route, records latency and positive outcome in health store", async () => {
    const healthStore = new InMemoryRouteHealthStore();
    const emittedEvents: string[] = [];
    const eventSink: IProbeEventSink = {
      async emitRouteHealthChanged(routeId, providerId, prev, curr) {
        emittedEvents.push(`health:${routeId}:${prev}->${curr}`);
      },
      async emitCircuitTransition(trans) {
        emittedEvents.push(`circuit:${trans.routeId}:${trans.newState}`);
      },
    };

    const scheduler = new ActiveHealthProbeScheduler(healthStore, eventSink, {
      probeIntervalMs: 1000,
      probeTimeoutMs: 2000,
      jitterMs: 0,
    });

    const target: RouteHealthTarget = {
      routeId: "route_openai_gpt4o",
      providerId: "openai",
      adapter: new MockAIProvider(),
      baseUrl: "https://api.openai.com",
      credential: "sk-mock",
    };

    await scheduler.probeSingleRoute(target);

    const snapshot = await healthStore.getRouteHealth(
      "route_openai_gpt4o",
      "openai",
    );
    expect(snapshot.state).toBe("healthy");
    expect(snapshot.circuitState).toBe("CLOSED");
    expect(snapshot.successRate).toBe(1.0);
  });

  it("handles distributed locking to prevent duplicate concurrent probes across workers", async () => {
    const healthStore = new InMemoryRouteHealthStore();
    const acquiredLocks = new Set<string>();

    const mockLock: IDistributedLock = {
      async acquire(key: string) {
        if (acquiredLocks.has(key)) {
          return { acquired: false };
        }
        acquiredLocks.add(key);
        return { acquired: true, leaseId: "lease_123" };
      },
      async release(key: string) {
        acquiredLocks.delete(key);
      },
    };

    const scheduler1 = new ActiveHealthProbeScheduler(healthStore, undefined, {
      lock: mockLock,
    });
    const scheduler2 = new ActiveHealthProbeScheduler(healthStore, undefined, {
      lock: mockLock,
    });

    const target: RouteHealthTarget = {
      routeId: "route_anthropic_claude",
      providerId: "anthropic",
      adapter: new MockAIProvider(),
      baseUrl: "https://api.anthropic.com",
      credential: "sk-mock",
    };

    // Run probes concurrently
    await Promise.all([
      scheduler1.probeSingleRoute(target),
      scheduler2.probeSingleRoute(target),
    ]);

    // Lock is released after completion
    expect(acquiredLocks.size).toBe(0);
  });
});
