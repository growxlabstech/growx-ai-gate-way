import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryProviderOperationRepository } from "../src/repository.js";
import { ProviderOperationPoller } from "../src/poller.js";
import { DeterministicOperationAdapter } from "../src/adapters/deterministic-operation-adapter.js";
import type { ProviderOperation } from "@growx/contracts";

describe("ProviderOperationPoller", () => {
  let repo: InMemoryProviderOperationRepository;
  let poller: ProviderOperationPoller;
  let adapter: DeterministicOperationAdapter;

  beforeEach(() => {
    repo = new InMemoryProviderOperationRepository();
    poller = new ProviderOperationPoller(repo, {
      baseIntervalMs: 1000,
      maxIntervalMs: 10000,
      leaseDurationMs: 5000,
    });
    adapter = new DeterministicOperationAdapter();
    poller.registerAdapter(adapter);
  });

  it("claims and polls due operations, transitioning to finalizing upon completion", async () => {
    const op: ProviderOperation = {
      id: "pop_test_1",
      organizationId: "org_test",
      requestId: "req_123",
      providerId: "deterministic",
      routeId: "rt_test",
      canonicalModelId: "openai/dall-e-3",
      providerOperationId: "pop_upstream_123",
      operationType: "image_generation",
      status: "running",
      pollStrategy: "poll",
      attemptCount: 0,
      createdAt: new Date(),
      metadata: {},
    };

    await repo.insert(op);

    // Mock status completed
    adapter.mockStatus = {
      status: "completed",
      resultReference: "ref_completed_result",
    };

    const claimedCount = await poller.pollDueOperations("worker_1");
    expect(claimedCount).toBe(1);

    const updated = await repo.getById("pop_test_1");
    expect(updated?.status).toBe("finalizing");
    expect(updated?.resultReference).toBe("ref_completed_result");
    expect(updated?.attemptCount).toBe(1);
  });

  it("calculates adaptive next poll timestamp with exponential backoff and jitter", () => {
    const next1 = poller.calculateNextPoll(1);
    const next5 = poller.calculateNextPoll(5);

    expect(next1.getTime()).toBeGreaterThan(Date.now());
    expect(next5.getTime()).toBeGreaterThan(next1.getTime());

    // Respects Retry-After seconds
    const retryAfterDate = poller.calculateNextPoll(1, 30);
    expect(retryAfterDate.getTime()).toBeGreaterThanOrEqual(Date.now() + 29000);
  });
});
