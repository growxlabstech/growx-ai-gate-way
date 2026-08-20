import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryCounterStore,
  InMemoryQuotaPolicyRepository,
  QuotaEngine,
  RouteCapacitySignalProvider,
  TokenEstimator,
} from "../src/index.js";

describe("Phase 11 — Capacity & Quota Engine Tests", () => {
  let counterStore: InMemoryCounterStore;
  let policyRepo: InMemoryQuotaPolicyRepository;
  let quotaEngine: QuotaEngine;
  let tokenEstimator: TokenEstimator;
  let capacitySignalProvider: RouteCapacitySignalProvider;

  beforeEach(() => {
    counterStore = new InMemoryCounterStore();
    policyRepo = new InMemoryQuotaPolicyRepository();
    tokenEstimator = new TokenEstimator();
    capacitySignalProvider = new RouteCapacitySignalProvider(counterStore, policyRepo);

    quotaEngine = new QuotaEngine(counterStore, policyRepo, {
      globalLimits: {
        rpm: 100,
        tpm: 100_000,
        concurrentRequests: 10,
        concurrentStreams: 5,
      },
      defaultOrgLimits: {
        rpm: 50,
        tpm: 50_000,
        concurrentRequests: 8,
        concurrentStreams: 4,
      },
      defaultWorkspaceLimits: {
        rpm: 20,
        tpm: 20_000,
        concurrentRequests: 5,
        concurrentStreams: 3,
      },
      concurrencyLeaseTtlSeconds: 60,
    });
  });

  describe("TokenEstimator", () => {
    it("estimates input tokens from text messages, system instruction, and tools", () => {
      const estimate = tokenEstimator.estimate({
        messages: [
          { role: "user", content: "Hello world, what is quantum computing?" },
          { role: "assistant", content: "Quantum computing is a field of computer science..." },
        ],
        system: "You are a helpful assistant.",
        tools: [
          {
            type: "function",
            function: { name: "get_weather", description: "Get weather in city", parameters: {} },
          },
        ],
        max_tokens: 256,
      });

      expect(estimate.inputTokens).toBeGreaterThan(15);
      expect(estimate.estimatedOutputReservation).toBe(256);
      expect(estimate.totalEstimatedTokens).toBe(estimate.inputTokens + 256);
      expect(estimate.source).toBe("explicit_max_tokens");
    });

    it("uses conservative default output reservation if max_tokens is omitted", () => {
      const estimate = tokenEstimator.estimate(
        {
          messages: [{ role: "user", content: "Hi" }],
        },
        { maxOutputTokens: 4096 }
      );

      expect(estimate.estimatedOutputReservation).toBe(1024); // min(1024, 4096 * 0.25)
      expect(estimate.source).toBe("heuristic");
    });
  });

  describe("Customer Quota Enforcement", () => {
    it("enforces API-key specific RPM limits", async () => {
      await policyRepo.saveLimit({
        scopeType: "api_key",
        scopeId: "key_strict",
        dimension: "requests",
        windowSeconds: 60,
        limit: 2,
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({ messages: [{ role: "user", content: "Hi" }] });

      // Request 1: Allowed
      const r1 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_strict" },
        organizationId: "org_1",
        workspaceId: "ws_1",
        estimatedTokens: estimate,
      });
      expect(r1.decision.allowed).toBe(true);

      // Request 2: Allowed
      const r2 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_strict" },
        organizationId: "org_1",
        workspaceId: "ws_1",
        estimatedTokens: estimate,
      });
      expect(r2.decision.allowed).toBe(true);

      // Request 3: Denied (API key limit 2 RPM exceeded)
      const r3 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_strict" },
        organizationId: "org_1",
        workspaceId: "ws_1",
        estimatedTokens: estimate,
      });
      expect(r3.decision.allowed).toBe(false);
      expect(r3.decision.denialCode).toBe("rate_limit_exceeded");
      expect(r3.decision.blockingScope?.scopeType).toBe("api_key");
      expect(r3.decision.blockingScope?.scopeId).toBe("key_strict");
    });

    it("aggregates multiple API keys toward the same Workspace limit", async () => {
      await policyRepo.saveLimit({
        scopeType: "workspace",
        scopeId: "ws_shared",
        dimension: "requests",
        windowSeconds: 60,
        limit: 3,
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({ messages: [{ role: "user", content: "Hi" }] });

      // Key 1 makes 2 requests
      await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_A" },
        organizationId: "org_1",
        workspaceId: "ws_shared",
        estimatedTokens: estimate,
      });
      await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_A" },
        organizationId: "org_1",
        workspaceId: "ws_shared",
        estimatedTokens: estimate,
      });

      // Key 2 makes 1 request -> Workspace reaches limit 3
      const r3 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_B" },
        organizationId: "org_1",
        workspaceId: "ws_shared",
        estimatedTokens: estimate,
      });
      expect(r3.decision.allowed).toBe(true);

      // Key 3 tries to make a request -> Denied at Workspace scope
      const r4 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_C" },
        organizationId: "org_1",
        workspaceId: "ws_shared",
        estimatedTokens: estimate,
      });
      expect(r4.decision.allowed).toBe(false);
      expect(r4.decision.denialCode).toBe("rate_limit_exceeded");
      expect(r4.decision.blockingScope?.scopeType).toBe("workspace");
      expect(r4.decision.blockingScope?.scopeId).toBe("ws_shared");
    });

    it("enforces TPM reservation and reconciles actual token usage on finalization", async () => {
      await policyRepo.saveLimit({
        scopeType: "workspace",
        scopeId: "ws_tokens",
        dimension: "total_tokens",
        windowSeconds: 60,
        limit: 1000,
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 600,
      }); // ~605 tokens

      // Reserve 605 tokens
      const { decision, reservation } = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_tokens",
        estimatedTokens: estimate,
      });
      expect(decision.allowed).toBe(true);
      expect(reservation).toBeDefined();

      // Second request with 600 tokens exceeds 1000 limit -> Denied
      const r2 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_tokens",
        estimatedTokens: estimate,
      });
      expect(r2.decision.allowed).toBe(false);
      expect(r2.decision.denialCode).toBe("token_rate_limit_exceeded");

      // Finalize first request with actual usage of only 100 tokens (over-reservation refund)
      await quotaEngine.finalizeReservation(reservation!, {
        inputTokens: 10,
        outputTokens: 90,
        totalTokens: 100,
      });

      // Now second request has enough capacity -> Allowed!
      const r3 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_tokens",
        estimatedTokens: estimate,
      });
      expect(r3.decision.allowed).toBe(true);
    });

    it("atomically rolls back provisional reservations if a downstream scope fails", async () => {
      await policyRepo.saveLimit({
        scopeType: "api_key",
        scopeId: "key_rollback",
        dimension: "requests",
        windowSeconds: 60,
        limit: 10,
        hard: true,
        enabled: true,
      });

      await policyRepo.saveLimit({
        scopeType: "workspace",
        scopeId: "ws_exhausted",
        dimension: "requests",
        windowSeconds: 60,
        limit: 1, // Workspace limit is only 1
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({ messages: [{ role: "user", content: "Hi" }] });

      // Request 1: Succeeds
      await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_rollback" },
        organizationId: "org_1",
        workspaceId: "ws_exhausted",
        estimatedTokens: estimate,
      });

      // Request 2: Fails at Workspace level
      const r2 = await quotaEngine.evaluateAndReserveCustomerQuota({
        apiKey: { id: "key_rollback" },
        organizationId: "org_1",
        workspaceId: "ws_exhausted",
        estimatedTokens: estimate,
      });
      expect(r2.decision.allowed).toBe(false);

      // Check API Key counter: should only have 1 request consumed, not 2
      const metrics = await counterStore.getCapacityMetrics([
        "ratelimit:api_key:key_rollback:requests:60",
      ]);
      expect(metrics["ratelimit:api_key:key_rollback:requests:60"]?.used).toBe(1);
    });

    it("enforces concurrent request and stream limits and releases on finalize", async () => {
      await policyRepo.saveLimit({
        scopeType: "workspace",
        scopeId: "ws_concurrency",
        dimension: "concurrent_requests",
        windowSeconds: 0,
        limit: 2,
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({ messages: [{ role: "user", content: "Hi" }] });

      const req1 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_concurrency",
        estimatedTokens: estimate,
      });
      expect(req1.decision.allowed).toBe(true);

      const req2 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_concurrency",
        estimatedTokens: estimate,
      });
      expect(req2.decision.allowed).toBe(true);

      // 3rd concurrent request exceeds limit 2
      const req3 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_concurrency",
        estimatedTokens: estimate,
      });
      expect(req3.decision.allowed).toBe(false);
      expect(req3.decision.denialCode).toBe("concurrency_limit_exceeded");

      // Complete req1
      await quotaEngine.finalizeReservation(req1.reservation!);

      // Now 3rd request can proceed
      const req4 = await quotaEngine.evaluateAndReserveCustomerQuota({
        organizationId: "org_1",
        workspaceId: "ws_concurrency",
        estimatedTokens: estimate,
      });
      expect(req4.decision.allowed).toBe(true);
    });
  });

  describe("Provider Attempt Capacity & Signals", () => {
    it("tracks provider attempt capacity per route and computes headroom signal", async () => {
      await policyRepo.saveLimit({
        scopeType: "provider_route",
        scopeId: "route_openai_gpt4",
        dimension: "requests",
        windowSeconds: 60,
        limit: 10,
        hard: true,
        enabled: true,
      });

      const estimate = tokenEstimator.estimate({ messages: [{ role: "user", content: "Hi" }] });

      // Signal before any attempts
      const signal0 = await capacitySignalProvider.getCapacitySignal(
        "route_openai_gpt4",
        "openai"
      );
      expect(signal0.headroom).toBe(1.0);
      expect(signal0.state).toBe("available");

      // Make 8 provider attempt reservations
      for (let i = 0; i < 8; i++) {
        await quotaEngine.evaluateAndReserveProviderAttempt({
          routeId: "route_openai_gpt4",
          providerId: "openai",
          estimatedTokens: estimate,
          attemptNumber: 1,
        });
      }

      // Signal at 80% saturation -> near_limit / busy
      const signal1 = await capacitySignalProvider.getCapacitySignal(
        "route_openai_gpt4",
        "openai"
      );
      expect(signal1.saturation).toBe(0.8);
      expect(signal1.state).toBe("busy");

      // Make 2 more attempts -> 100% saturation -> exhausted
      for (let i = 0; i < 2; i++) {
        await quotaEngine.evaluateAndReserveProviderAttempt({
          routeId: "route_openai_gpt4",
          providerId: "openai",
          estimatedTokens: estimate,
          attemptNumber: 1,
        });
      }

      const signal2 = await capacitySignalProvider.getCapacitySignal(
        "route_openai_gpt4",
        "openai"
      );
      expect(signal2.state).toBe("exhausted");
      expect(signal2.headroom).toBe(0);

      // Attempt 11 is denied due to provider capacity exhaustion
      const attempt11 = await quotaEngine.evaluateAndReserveProviderAttempt({
        routeId: "route_openai_gpt4",
        providerId: "openai",
        estimatedTokens: estimate,
        attemptNumber: 1,
      });
      expect(attempt11.decision.allowed).toBe(false);
      expect(attempt11.decision.denialCode).toBe("provider_capacity_exhausted");
    });

    it("immediately marks route exhausted on 429 provider feedback", async () => {
      await capacitySignalProvider.recordProviderFeedback({
        routeId: "route_anthropic_claude",
        providerId: "anthropic",
        is429: true,
        retryAfterSeconds: 30,
      });

      const signal = await capacitySignalProvider.getCapacitySignal(
        "route_anthropic_claude",
        "anthropic"
      );
      expect(signal.state).toBe("exhausted");
      expect(signal.headroom).toBe(0);
    });
  });
});
