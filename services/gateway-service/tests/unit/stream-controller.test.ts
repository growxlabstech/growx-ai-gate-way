import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GatewayStreamController } from "../../src/application/stream-controller.js";
import { StreamRegistry } from "../../src/application/shutdown.js";
import { StreamState } from "../../src/domain/stream-state.js";
import { InMemoryGatewayRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryGatewayEvents } from "../../src/infrastructure/events.js";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { NormalizedStreamEvent } from "@growx/contracts";

function createMockAuth(): MachineAuthContext {
  return {
    apiKeyId: "key_test",
    organizationId: "org_test",
    workspaceId: "ws_test",
    environmentId: "env_test",
    permissions: ["chat.completions.create"],
    modelRules: [],
    rateLimits: [],
    ipAllowlist: [],
  } as any;
}

function createDeps() {
  const repository = new InMemoryGatewayRepository();
  const events = new InMemoryGatewayEvents();
  const registry = new StreamRegistry();
  return { repository, events, registry };
}

function createController(
  deps = createDeps(),
  options: any = {}
) {
  const ctx = {
    requestId: "req_test123",
    auth: createMockAuth(),
    canonicalModelId: "openai/gpt-4o-mini",
    providerId: "prov_mock",
    requestedModel: "openai/gpt-4o-mini",
    startTime: Date.now(),
  };

  const controller = new GatewayStreamController(deps, ctx, options);
  return { controller, deps, ctx };
}

function createDeltaEvent(seq: number, delta: string): NormalizedStreamEvent {
  return {
    requestId: "req_test123",
    responseId: "resp_test",
    sequence: seq,
    type: "output_text.delta",
    timestamp: new Date().toISOString(),
    delta,
  };
}

function createCompletedEvent(seq: number): NormalizedStreamEvent {
  return {
    requestId: "req_test123",
    responseId: "resp_test",
    sequence: seq,
    type: "response.completed",
    timestamp: new Date().toISOString(),
    finishReason: "stop",
    response: {
      requestId: "req_test123",
      canonicalModelId: "openai/gpt-4o-mini",
      providerId: "prov_mock",
      providerModelId: "gpt-4o-mini",
      output: [{ role: "assistant", content: "Hello!" }],
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        source: "provider_reported",
      },
      timing: {
        startedAt: new Date(),
        completedAt: new Date(),
        latencyMs: 20,
      },
    },
  };
}

describe("GatewayStreamController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("state transitions", () => {
    it("transitions through happy path: INITIAL → VALIDATED → CONNECTING → STREAMING → COMPLETING → COMPLETED", async () => {
      const { controller, deps } = createController();

      // Seed a request record for finalization
      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);

      expect(controller.currentState).toBe(StreamState.INITIAL);

      controller.transitionToValidated();
      expect(controller.currentState).toBe(StreamState.VALIDATED);

      controller.transitionToConnecting();
      expect(controller.currentState).toBe(StreamState.CONNECTING);

      controller.transitionToStreaming();
      expect(controller.currentState).toBe(StreamState.STREAMING);

      // Process events
      controller.processProviderEvent(createDeltaEvent(0, "Hello"));
      controller.processProviderEvent(createCompletedEvent(1));

      await controller.finalizeOnce(StreamState.COMPLETED);
      expect(controller.currentState).toBe(StreamState.COMPLETED);

      controller.cleanup();
    });
  });

  describe("finalizeOnce idempotency", () => {
    it("only the first call takes effect", async () => {
      const { controller, deps } = createController();

      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);

      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      controller.processProviderEvent(createCompletedEvent(0));

      await controller.finalizeOnce(StreamState.COMPLETED);
      // Second call should be a no-op
      await controller.finalizeOnce(StreamState.FAILED, new Error("late error"));

      // Should still be COMPLETED, not FAILED
      const req = await deps.repository.getRequest("req_test123");
      expect(req?.status).toBe("completed");

      controller.cleanup();
    });
  });

  describe("TTFT capture", () => {
    it("captures time-to-first-token on first output_text.delta", () => {
      const { controller } = createController();
      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      expect(controller.currentMetrics.firstTokenAt).toBeNull();
      expect(controller.hasEmittedOutput).toBe(false);

      controller.processProviderEvent(createDeltaEvent(0, "Hi"));

      expect(controller.currentMetrics.firstTokenAt).not.toBeNull();
      expect(controller.hasEmittedOutput).toBe(true);

      controller.cleanup();
    });

    it("does not update TTFT on subsequent deltas", () => {
      const { controller } = createController();
      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      controller.processProviderEvent(createDeltaEvent(0, "First"));
      const firstTTFT = controller.currentMetrics.firstTokenAt;

      controller.processProviderEvent(createDeltaEvent(1, "Second"));
      expect(controller.currentMetrics.firstTokenAt).toBe(firstTTFT);

      controller.cleanup();
    });
  });

  describe("usage capture", () => {
    it("captures usage from response.completed event", async () => {
      const { controller, deps } = createController();

      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);

      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      controller.processProviderEvent(createDeltaEvent(0, "Hello"));
      controller.processProviderEvent(createCompletedEvent(1));

      await controller.finalizeOnce(StreamState.COMPLETED);

      // Verify usage snapshot was persisted
      expect(deps.repository.usages.size).toBe(1);
      const usage = [...deps.repository.usages.values()][0]!;
      expect(usage.inputTokens).toBe(10);
      expect(usage.outputTokens).toBe(5);
      expect(usage.totalTokens).toBe(15);

      // Verify latency record was persisted
      expect(deps.repository.latencies.size).toBe(1);
      const latency = deps.repository.latencies.get("req_test123");
      expect(latency).toBeDefined();
      expect(latency!.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(latency!.timeToFirstTokenMs).toBeDefined();

      controller.cleanup();
    });
  });

  describe("error record persistence on failure", () => {
    it("persists error record and emits failed event", async () => {
      const { controller, deps } = createController();

      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);

      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      await controller.finalizeOnce(StreamState.FAILED, new Error("Provider exploded"));

      // Verify error record was saved
      expect(deps.repository.errors.size).toBe(1);
      const err = [...deps.repository.errors.values()][0]!;
      expect(err.code).toBe("Error");
      expect(err.safeMessage).toBe("Provider exploded");

      // Verify failed event was emitted
      expect(deps.events.failedEvents.length).toBe(1);
      expect(deps.events.failedEvents[0]!.requestId).toBe("req_test123");

      // Verify request status
      const req = await deps.repository.getRequest("req_test123");
      expect(req?.status).toBe("failed");

      controller.cleanup();
    });
  });

  describe("cancellation", () => {
    it("emits cancelled event on CANCELLED state", async () => {
      const { controller, deps } = createController();

      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);

      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      await controller.finalizeOnce(StreamState.CANCELLED);

      // Verify cancelled event was emitted
      expect(deps.events.cancelledEvents.length).toBe(1);
      expect(deps.events.cancelledEvents[0]!.requestId).toBe("req_test123");

      controller.cleanup();
    });

    it("propagates client signal abort to internal controller", () => {
      const clientAbort = new AbortController();
      const { controller } = createController(undefined, {
        cancellationSignal: clientAbort.signal,
      });

      expect(controller.signal.aborted).toBe(false);
      clientAbort.abort("client disconnect");
      expect(controller.signal.aborted).toBe(true);

      controller.cleanup();
    });
  });

  describe("active stream gauge", () => {
    it("unregisters from registry on finalization", async () => {
      const deps = createDeps();
      const { controller } = createController(deps);

      await deps.repository.createRequest({
        id: "req_test123",
        organizationId: "org_test",
        workspaceId: "ws_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        requestedModel: "openai/gpt-4o-mini",
        resolvedModel: "openai/gpt-4o-mini",
        status: "streaming",
        stream: true,
        providerId: "prov_mock",
        providerModelId: "gpt-4o-mini",
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(),
      });

      deps.registry.register("req_test123", controller);
      expect(deps.registry.activeCount).toBe(1);

      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();
      controller.processProviderEvent(createCompletedEvent(0));

      await controller.finalizeOnce(StreamState.COMPLETED);
      expect(deps.registry.activeCount).toBe(0);

      controller.cleanup();
    });
  });

  describe("chunk tracking", () => {
    it("tracks chunks emitted and bytes written", () => {
      const { controller } = createController();
      controller.transitionToValidated();
      controller.transitionToConnecting();
      controller.transitionToStreaming();

      controller.recordChunkWritten(42);
      controller.recordChunkWritten(38);

      expect(controller.currentMetrics.chunksEmitted).toBe(2);
      expect(controller.currentMetrics.bytesWritten).toBe(80);

      controller.cleanup();
    });
  });

  describe("includeUsage option", () => {
    it("respects includeUsage flag", () => {
      const { controller: c1 } = createController(undefined, {});
      expect(c1.shouldIncludeUsage).toBe(false);
      c1.cleanup();

      const { controller: c2 } = createController(undefined, { includeUsage: true });
      expect(c2.shouldIncludeUsage).toBe(true);
      c2.cleanup();
    });
  });
});
