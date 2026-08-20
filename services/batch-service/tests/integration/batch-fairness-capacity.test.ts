import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBatchRepository } from "../../src/infrastructure/batch-repository.js";
import { BatchService } from "../../src/application/batch-service.js";
import { BatchWorker } from "../../src/application/batch-worker.js";
import { BatchScheduler } from "../../src/application/batch-scheduler.js";
import { BatchFinalizer } from "../../src/application/batch-finalizer.js";
import type { MachineAuthContext } from "@growx/api-key-service";

describe("Batch Fairness and Capacity Protection Integration", () => {
  let batchRepo: InMemoryBatchRepository;
  let mockGatewayEngine: any;
  let batchService: BatchService;
  let worker: BatchWorker;
  let scheduler: BatchScheduler;
  let executedTenants: string[] = [];

  const authTenantA: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_a",
    organizationId: "org_heavy",
    workspaceId: "ws_a",
    environmentId: "env_prod",
    environment: "production",
    name: "Key A",
    permissions: ["batches.create", "batches.read", "batches.cancel", "chat.completions.create"],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_a",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  const authTenantB: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_b",
    organizationId: "org_light",
    workspaceId: "ws_b",
    environmentId: "env_prod",
    environment: "production",
    name: "Key B",
    permissions: ["batches.create", "batches.read", "batches.cancel", "chat.completions.create"],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_b",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  beforeEach(() => {
    batchRepo = new InMemoryBatchRepository();
    executedTenants = [];

    mockGatewayEngine = {
      executeChatCompletion: async (auth: MachineAuthContext) => {
        executedTenants.push(auth.organizationId);
        return {
          id: "chatcmpl_fair",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        };
      },
    };

    const finalizer = new BatchFinalizer({ batchRepository: batchRepo });
    batchService = new BatchService({ batchRepository: batchRepo, finalizer });
    
    // Worker with concurrency=4 and maxPerTenant=2
    worker = new BatchWorker(
      {
        batchRepository: batchRepo,
        gatewayEngine: mockGatewayEngine,
        finalizer,
      },
      { workerId: "worker-fair", concurrency: 4, leaseDurationMs: 10000, maxPerTenant: 2 }
    );

    scheduler = new BatchScheduler({ batchRepository: batchRepo, finalizer });
  });

  it("ensures heavy tenant with 20 items does not starve light tenant with 2 items", async () => {
    // Tenant A creates batch with 20 items
    const heavyItems = Array.from({ length: 20 }).map((_, i) => ({
      custom_id: `heavy-${i}`,
      body: { model: "gpt-4o", messages: [{ role: "user", content: `msg ${i}` }] },
    }));
    await batchService.createBatch(authTenantA, { items: heavyItems });

    // Tenant B creates batch with 2 items
    await batchService.createBatch(authTenantB, {
      items: [
        { custom_id: "light-1", body: { model: "gpt-4o", messages: [{ role: "user", content: "b1" }] } },
        { custom_id: "light-2", body: { model: "gpt-4o", messages: [{ role: "user", content: "b2" }] } },
      ],
    });

    await scheduler.step();

    // Step 1: Worker claims 4 items total (2 from Org A, 2 from Org B because maxPerTenant=2)
    const claimedFirstStep = await worker.step();
    expect(claimedFirstStep).toBe(4);

    const firstStepTenantsA = executedTenants.filter(t => t === "org_heavy").length;
    const firstStepTenantsB = executedTenants.filter(t => t === "org_light").length;

    expect(firstStepTenantsA).toBe(2);
    expect(firstStepTenantsB).toBe(2);
  });
});
