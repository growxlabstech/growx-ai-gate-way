import { describe, it, expect, afterEach } from "vitest";
import { StreamRegistry } from "../../src/application/shutdown.js";
import { GatewayStreamController } from "../../src/application/stream-controller.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";

function createTestController(registry: StreamRegistry, requestId: string) {
  const repository = new InMemoryGatewayRepository();
  const events = new InMemoryGatewayEvents();
  const controller = new GatewayStreamController(
    { repository, events, registry },
    {
      requestId,
      auth: {
        apiKeyId: "key_test",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        permissions: ["chat.completions.create"],
        modelRules: [],
        rateLimits: [],
        ipAllowlist: [],
      } as any,
      canonicalModelId: "openai/gpt-4o-mini",
      providerId: "prov_mock",
      requestedModel: "openai/gpt-4o-mini",
      startTime: Date.now(),
    },
  );
  return { controller, repository, events };
}

describe("StreamRegistry", () => {
  it("tracks active stream count", () => {
    const registry = new StreamRegistry();

    const { controller: c1 } = createTestController(registry, "req_1");
    const { controller: c2 } = createTestController(registry, "req_2");

    registry.register("req_1", c1);
    expect(registry.activeCount).toBe(1);

    registry.register("req_2", c2);
    expect(registry.activeCount).toBe(2);

    registry.unregister("req_1");
    expect(registry.activeCount).toBe(1);

    registry.unregister("req_2");
    expect(registry.activeCount).toBe(0);

    c1.cleanup();
    c2.cleanup();
  });

  it("rejects new registrations during shutdown", () => {
    const registry = new StreamRegistry();

    // Start shutdown (no active streams, resolves immediately)
    const shutdownPromise = registry.initiateGracefulShutdown(100);

    const { controller } = createTestController(registry, "req_late");

    expect(() => {
      registry.register("req_late", controller);
    }).toThrow("shutting down");

    controller.cleanup();
    return shutdownPromise;
  });

  it("resolves immediately when no active streams", async () => {
    const registry = new StreamRegistry();
    const start = Date.now();
    await registry.initiateGracefulShutdown(5000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000); // Should be near-instant
  });

  it("waits for active streams during grace period", async () => {
    const registry = new StreamRegistry();

    const { controller } = createTestController(registry, "req_active");
    registry.register("req_active", controller);

    // Start shutdown with 500ms grace
    const shutdownPromise = registry.initiateGracefulShutdown(500);

    // Simulate stream completing after 100ms
    setTimeout(() => {
      registry.unregister("req_active");
    }, 100);

    const start = Date.now();
    await shutdownPromise;
    const elapsed = Date.now() - start;

    // Should have waited for the stream, not the full grace period
    expect(elapsed).toBeLessThan(400);
    expect(registry.activeCount).toBe(0);

    controller.cleanup();
  });

  it("aborts remaining streams after grace period expires", async () => {
    const registry = new StreamRegistry();

    const { controller } = createTestController(registry, "req_stuck");
    registry.register("req_stuck", controller);

    // Start shutdown with very short grace
    const start = Date.now();
    await registry.initiateGracefulShutdown(200);
    const elapsed = Date.now() - start;

    // Should have waited approximately the grace period then aborted
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(registry.activeCount).toBe(0);

    // The controller's abort should have been called
    expect(controller.signal.aborted).toBe(true);

    controller.cleanup();
  });

  it("reset clears all state", () => {
    const registry = new StreamRegistry();
    const { controller } = createTestController(registry, "req_test");
    registry.register("req_test", controller);
    expect(registry.activeCount).toBe(1);

    registry.reset();
    expect(registry.activeCount).toBe(0);
    expect(registry.isShuttingDown).toBe(false);

    controller.cleanup();
  });
});
