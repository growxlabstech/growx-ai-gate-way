import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBatchRepository } from "../../src/infrastructure/batch-repository.js";
import { BatchService } from "../../src/application/batch-service.js";
import { BatchReconciler } from "../../src/application/batch-reconciler.js";
import { BatchFinalizer } from "../../src/application/batch-finalizer.js";
import type { MachineAuthContext } from "@growx/api-key-service";

describe("Batch Reconciler Integration", () => {
  let batchRepo: InMemoryBatchRepository;
  let reconciler: BatchReconciler;
  let batchService: BatchService;

  const authContext: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_recon",
    organizationId: "org_recon",
    workspaceId: "ws_recon",
    environmentId: "env_dev",
    environment: "development",
    name: "Recon Key",
    permissions: [
      "batches.create",
      "batches.read",
      "batches.cancel",
      "chat.completions.create",
    ],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_recon",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  beforeEach(() => {
    batchRepo = new InMemoryBatchRepository();
    const finalizer = new BatchFinalizer({ batchRepository: batchRepo });
    reconciler = new BatchReconciler({ batchRepository: batchRepo, finalizer });
    batchService = new BatchService({ batchRepository: batchRepo, finalizer });
  });

  it("recovers expired leases and re-queues stuck items", async () => {
    const batch = await batchService.createBatch(authContext, {
      items: [
        {
          custom_id: "rec-1",
          body: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "hi" }],
          },
        },
      ],
    });

    const items = await batchRepo.getAllBatchItems(batch.id);
    const item = items[0];

    // Simulate item claimed with an expired lease
    await batchRepo.updateBatchItem({
      ...item,
      status: "running",
    });

    // Acquire lease in past
    await batchRepo.acquireLease("batch_item", item.id, "dead-worker", -5000);

    const reconRes = await reconciler.reconcile();
    expect(reconRes.recoveredLeases).toBe(1);

    const recheckItem = await batchRepo.getBatchItemById(item.id);
    expect(recheckItem?.status).toBe("queued");
  });

  it("reconciles counter drift with actual item rows", async () => {
    const batch = await batchService.createBatch(authContext, {
      items: [
        {
          custom_id: "drift-1",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] },
        },
        {
          custom_id: "drift-2",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "2" }] },
        },
      ],
    });

    // Artificially corrupt counters
    await batchRepo.updateBatchJobCounters(batch.id, { succeeded: 99 });

    const corrupted = await batchRepo.getBatchJobById(batch.id);
    expect(corrupted?.succeededItems).toBe(99);

    const reconRes = await reconciler.reconcile();
    expect(reconRes.reconciledJobs).toBe(1);

    const fixed = await batchRepo.getBatchJobById(batch.id);
    expect(fixed?.succeededItems).toBe(0);
  });
});
