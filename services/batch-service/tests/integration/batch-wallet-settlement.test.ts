import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBatchRepository } from "../../src/infrastructure/batch-repository.js";
import { BatchService } from "../../src/application/batch-service.js";
import { BatchWorker } from "../../src/application/batch-worker.js";
import { BatchScheduler } from "../../src/application/batch-scheduler.js";
import { BatchFinalizer } from "../../src/application/batch-finalizer.js";
import type { MachineAuthContext } from "@growx/api-key-service";

describe("Batch Wallet & Credit Reservation Integration", () => {
  let batchRepo: InMemoryBatchRepository;
  let mockGatewayEngine: any;
  let mockCreditService: any;
  let finalizer: BatchFinalizer;
  let batchService: BatchService;
  let worker: BatchWorker;
  let scheduler: BatchScheduler;

  const authContext: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_wallet_test",
    organizationId: "org_wallet",
    workspaceId: "ws_wallet",
    environmentId: "env_dev",
    environment: "development",
    name: "Wallet Test Key",
    permissions: ["batches.create", "batches.read", "batches.cancel", "chat.completions.create"],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_wallet_owner",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  beforeEach(() => {
    batchRepo = new InMemoryBatchRepository();
    mockGatewayEngine = {
      executeChatCompletion: async () => ({
        id: "chatcmpl_123",
        choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    };

    mockCreditService = {
      reservations: [] as any[],
      settlements: [] as any[],
    };

    finalizer = new BatchFinalizer({
      batchRepository: batchRepo,
      creditService: mockCreditService,
    });

    batchService = new BatchService({
      batchRepository: batchRepo,
      creditService: mockCreditService,
      finalizer,
    });

    worker = new BatchWorker(
      {
        batchRepository: batchRepo,
        gatewayEngine: mockGatewayEngine,
        finalizer,
      },
      { workerId: "worker-wallet", concurrency: 5, leaseDurationMs: 10000, maxPerTenant: 10 }
    );

    scheduler = new BatchScheduler({
      batchRepository: batchRepo,
      finalizer,
    });
  });

  it("creates credit reservation upon batch creation and releases it upon finalization", async () => {
    const batch = await batchService.createBatch(authContext, {
      items: [
        { custom_id: "w-1", body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] } },
        { custom_id: "w-2", body: { model: "gpt-4o", messages: [{ role: "user", content: "2" }] } },
      ],
    });

    const res = await batchRepo.getReservation(batch.id);
    expect(res).toBeDefined();
    expect(res?.status).toBe("reserved");
    expect(Number(res?.reservedCreditsAmount)).toBeGreaterThan(0);

    // Execute & finalize
    await scheduler.step();
    await worker.step();
    await scheduler.step();

    const finalizedRes = await batchRepo.getReservation(batch.id);
    expect(finalizedRes?.status).toBe("released");
    expect(finalizedRes?.releasedAt).toBeDefined();
  });
});
