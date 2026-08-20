import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryProviderOperationRepository,
  ProviderOperationPoller,
  ProviderOperationFinalizer,
  ProviderOperationCallbackHandler,
  ProviderOperationReconciler,
  DeterministicOperationAdapter,
} from "@growx/provider-operations";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type { ProviderOperation } from "@growx/contracts";

describe("Provider Operations Runtime Lifecycle (Phase 34)", () => {
  let fixture: TestGatewayFixture;
  let repo: InMemoryProviderOperationRepository;
  let adapter: DeterministicOperationAdapter;
  let poller: ProviderOperationPoller;
  let finalizer: ProviderOperationFinalizer;
  let callbackHandler: ProviderOperationCallbackHandler;
  let reconciler: ProviderOperationReconciler;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    repo = new InMemoryProviderOperationRepository();
    adapter = new DeterministicOperationAdapter();

    finalizer = new ProviderOperationFinalizer(repo, {
      usageMetering: (fixture as any).usageMetering,
      creditService: (fixture as any).creditService,
    });
    finalizer.registerAdapter(adapter);

    poller = new ProviderOperationPoller(repo, {
      baseIntervalMs: 1000,
      maxIntervalMs: 5000,
      leaseDurationMs: 10000,
    });
    poller.registerAdapter(adapter);

    callbackHandler = new ProviderOperationCallbackHandler(repo, finalizer);
    callbackHandler.registerAdapter(adapter);

    reconciler = new ProviderOperationReconciler(repo, finalizer);
  });

  it("completes async operation via leased polling and finalizer", async () => {
    const op: ProviderOperation = {
      id: "pop_test_poll_1",
      organizationId: "org_gw_test",
      requestId: "req_async_123",
      providerId: "deterministic",
      routeId: "rt_test",
      canonicalModelId: "openai/gpt-4o-mini",
      providerOperationId: "upstream_batch_123",
      operationType: "provider_batch",
      status: "running",
      pollStrategy: "poll",
      attemptCount: 0,
      createdAt: new Date(),
      metadata: { billingReservationId: "res_test_123" },
    };
    await repo.insert(op);

    adapter.mockStatus = {
      status: "completed",
      resultReference: "ref_batch_output_file",
    };

    // 1. Poller claims and moves operation to 'finalizing'
    const polledCount = await poller.pollDueOperations("worker_node_1");
    expect(polledCount).toBe(1);

    const finalizingOp = await repo.getById("pop_test_poll_1");
    expect(finalizingOp?.status).toBe("finalizing");

    // 2. Finalizer retrieves result, records usage, settles wallet, marks 'completed'
    await finalizer.finalize("pop_test_poll_1");

    const completedOp = await repo.getById("pop_test_poll_1");
    expect(completedOp?.status).toBe("completed");
    expect(completedOp?.completedAt).toBeDefined();
  });

  it("handles authenticated callbacks and prevents state regressions", async () => {
    const op: ProviderOperation = {
      id: "pop_test_cb_1",
      organizationId: "org_gw_test",
      requestId: "req_cb_123",
      providerId: "deterministic",
      routeId: "rt_test",
      canonicalModelId: "openai/dall-e-3",
      providerOperationId: "upstream_img_123",
      operationType: "image_generation",
      status: "running",
      pollStrategy: "callback",
      attemptCount: 0,
      createdAt: new Date(),
      metadata: {},
    };
    await repo.insert(op);

    // Valid callback completes operation
    const result = await callbackHandler.handleCallback(
      "deterministic",
      { providerOperationId: "upstream_img_123", status: "completed" },
      { authorization: "Bearer webhook_secret_token" },
      "webhook_secret_token"
    );

    expect(result.handled).toBe(true);
    const completedOp = await repo.getById("pop_test_cb_1");
    expect(completedOp?.status).toBe("completed");

    // Out-of-order callback arriving late with status 'running' does NOT regress 'completed'
    const regressiveResult = await callbackHandler.handleCallback(
      "deterministic",
      { providerOperationId: "upstream_img_123", status: "running" },
      {}
    );

    expect(regressiveResult.handled).toBe(true);
    const persistedOp = await repo.getById("pop_test_cb_1");
    expect(persistedOp?.status).toBe("completed");
  });

  it("allows cancellation and prevents further polling", async () => {
    const op: ProviderOperation = {
      id: "pop_test_cancel_1",
      organizationId: "org_gw_test",
      requestId: "req_cancel_123",
      providerId: "deterministic",
      routeId: "rt_test",
      canonicalModelId: "openai/gpt-4o-mini",
      providerOperationId: "upstream_cancel_123",
      operationType: "async_inference",
      status: "running",
      pollStrategy: "poll",
      attemptCount: 0,
      createdAt: new Date(),
      metadata: {},
    };
    await repo.insert(op);

    const cancelRes = await adapter.cancelOperation!("upstream_cancel_123");
    expect(cancelRes.cancelled).toBe(true);

    await repo.update("pop_test_cancel_1", {
      status: "cancelled",
      cancelledAt: new Date(),
    });

    const polledCount = await poller.pollDueOperations("worker_node_1");
    expect(polledCount).toBe(0); // Cancelled operations are not polled
  });

  it("reconciles stuck finalizing operations without duplicating provider execution", async () => {
    const stuckOp: ProviderOperation = {
      id: "pop_test_stuck_1",
      organizationId: "org_gw_test",
      requestId: "req_stuck_123",
      providerId: "deterministic",
      routeId: "rt_test",
      canonicalModelId: "openai/gpt-4o-mini",
      providerOperationId: "upstream_stuck_123",
      operationType: "provider_batch",
      status: "finalizing",
      pollStrategy: "poll",
      resultReference: "ref_stuck_result",
      attemptCount: 2,
      createdAt: new Date(Date.now() - 600_000),
      lastPolledAt: new Date(Date.now() - 600_000),
      metadata: {},
    };
    await repo.insert(stuckOp);

    const recoveredCount = await reconciler.reconcileStuckOperations(300_000);
    expect(recoveredCount).toBe(1);

    const recoveredOp = await repo.getById("pop_test_stuck_1");
    expect(recoveredOp?.status).toBe("completed");
  });
});
