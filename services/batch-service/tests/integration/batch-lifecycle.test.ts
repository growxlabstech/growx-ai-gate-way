import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBatchRepository } from "../../src/infrastructure/batch-repository.js";
import { BatchService } from "../../src/application/batch-service.js";
import { BatchWorker } from "../../src/application/batch-worker.js";
import { BatchScheduler } from "../../src/application/batch-scheduler.js";
import { BatchFinalizer } from "../../src/application/batch-finalizer.js";
import type { MachineAuthContext } from "@growx/api-key-service";
import { FileService } from "@growx/storage-service";
import { InMemoryObjectStorageProvider } from "@growx/storage-service";
import { InMemoryFileRepository } from "@growx/storage-service";

describe("Batch Execution Plane Lifecycle Integration", () => {
  let batchRepo: InMemoryBatchRepository;
  let fileService: FileService;
  let mockGatewayEngine: any;
  let mockCreditService: any;
  let mockAuditService: any;
  let mockWebhookService: any;
  let mockNotificationService: any;
  let finalizer: BatchFinalizer;
  let batchService: BatchService;
  let worker: BatchWorker;
  let scheduler: BatchScheduler;

  const authContext: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_test_123",
    organizationId: "org_alpha",
    workspaceId: "ws_alpha_1",
    environmentId: "env_dev",
    environment: "development",
    name: "Test Batch Key",
    permissions: ["batches.create", "batches.read", "batches.cancel", "chat.completions.create", "models.read"],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_owner_1",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  beforeEach(async () => {
    batchRepo = new InMemoryBatchRepository();
    const storageProvider = new InMemoryObjectStorageProvider();
    const fileRepo = new InMemoryFileRepository();
    fileService = new FileService(storageProvider, fileRepo);

    mockGatewayEngine = {
      executeChatCompletion: async (_auth: any, req: any) => {
        return {
          id: `chatcmpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: req.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: `Echo: ${req.messages[0].content}` },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      },
    };

    mockCreditService = {
      grantCredits: async () => {},
    };

    mockAuditService = {
      events: [] as any[],
      recordEvent: async (evt: any) => {
        mockAuditService.events.push(evt);
      },
    };

    mockWebhookService = {
      events: [] as any[],
      dispatchEvent: async (evt: any) => {
        mockWebhookService.events.push(evt);
      },
    };

    mockNotificationService = {
      notifications: [] as any[],
      sendNotification: async (notif: any) => {
        mockNotificationService.notifications.push(notif);
      },
    };

    finalizer = new BatchFinalizer({
      batchRepository: batchRepo,
      fileService,
      creditService: mockCreditService,
      auditService: mockAuditService,
      webhookService: mockWebhookService,
      notificationService: mockNotificationService,
    });

    batchService = new BatchService({
      batchRepository: batchRepo,
      fileService,
      creditService: mockCreditService,
      auditService: mockAuditService,
      webhookService: mockWebhookService,
      notificationService: mockNotificationService,
      finalizer,
    });

    worker = new BatchWorker(
      {
        batchRepository: batchRepo,
        gatewayEngine: mockGatewayEngine,
        finalizer,
      },
      { workerId: "worker-1", concurrency: 5, leaseDurationMs: 10000, maxPerTenant: 10 }
    );

    scheduler = new BatchScheduler({
      batchRepository: batchRepo,
      finalizer,
    });
  });

  it("submits direct array items, executes them, and finalizes with output file", async () => {
    // 1. Submit batch
    const batch = await batchService.createBatch(authContext, {
      items: [
        {
          custom_id: "item-1",
          method: "POST",
          url: "/v1/chat/completions",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "Hello batch 1" }] },
        },
        {
          custom_id: "item-2",
          method: "POST",
          url: "/v1/chat/completions",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "Hello batch 2" }] },
        },
      ],
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
      metadata: { department: "qa" },
    });

    expect(batch.id).toMatch(/^batch_/);
    expect(batch.totalItems).toBe(2);
    expect(batch.status).toBe("queued");

    // 2. Scheduler activation
    const schedRes1 = await scheduler.step();
    expect(schedRes1.activatedCount).toBe(1);

    const runningJob = await batchService.getBatch(authContext, batch.id);
    expect(runningJob.status).toBe("running");

    // 3. Worker executes items
    const executedCount = await worker.step();
    expect(executedCount).toBe(2);

    // 4. Scheduler detects all items complete -> triggers finalizer
    const schedRes2 = await scheduler.step();
    expect(schedRes2.finalizedCount).toBe(1);

    // 5. Verify completed batch state
    const completedJob = await batchService.getBatch(authContext, batch.id);
    expect(completedJob.status).toBe("completed");
    expect(completedJob.succeededItems).toBe(2);
    expect(completedJob.failedItems).toBe(0);
    expect(completedJob.outputFileId).toBeTruthy();

    // 6. Verify output file content in FileService
    const tenant = { organizationId: authContext.organizationId, workspaceId: authContext.workspaceId };
    const outputFile = await fileService.getFile(tenant, completedJob.outputFileId!);
    expect(outputFile.purpose).toBe("batch_output");

    const contentStream = await fileService.getFileContentStream(tenant, completedJob.outputFileId!);
    const contentText = (contentStream.body as Buffer).toString("utf8");
    expect(contentText).toContain('"custom_id":"item-1"');
    expect(contentText).toContain('"custom_id":"item-2"');
    expect(contentText).toContain("Echo: Hello batch 1");

    // 7. Verify notifications and webhooks (one per batch)
    expect(mockWebhookService.events.length).toBe(1);
    expect(mockWebhookService.events[0].type).toBe("batch.completed.v1");
    expect(mockNotificationService.notifications.length).toBe(1);
  });

  it("submits Phase-25 input file, parses JSONL stream, executes, and creates error file on failures", async () => {
    // 1. Create and upload Phase-25 input JSONL file
    const inputJsonl = [
      JSON.stringify({ custom_id: "task-1", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "ok" }] } }),
      JSON.stringify({ custom_id: "task-2-fail", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "fail-me" }] } }),
    ].join("\n");

    const tenant = { organizationId: authContext.organizationId, workspaceId: authContext.workspaceId };
    const createRes = await fileService.createFile(tenant, {
      fileName: "input.jsonl",
      purpose: "batch_input",
      mimeType: "application/jsonl",
      uploadType: "single",
      sizeBytes: Buffer.byteLength(inputJsonl, "utf8"),
    });

    await fileService.storageProvider.putObject(createRes.file.storageKey, Buffer.from(inputJsonl, "utf8"), { contentType: "application/jsonl" });
    const compRes = await fileService.completeUpload(tenant, createRes.file.id, { uploadSessionId: createRes.uploadSessionId });

    // Mock failure for task-2
    mockGatewayEngine.executeChatCompletion = async (_auth: any, req: any) => {
      if (req.messages[0].content === "fail-me") {
        const err: any = new Error("Invalid prompt parameter");
        err.statusCode = 400;
        err.code = "invalid_request";
        throw err;
      }
      return {
        id: "chatcmpl_success",
        choices: [{ index: 0, message: { role: "assistant", content: "Success response" }, finish_reason: "stop" }],
      };
    };

    // 2. Create batch with input file ID
    const batch = await batchService.createBatch(authContext, {
      input_file_id: compRes.file.id,
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
    });

    expect(batch.totalItems).toBe(2);

    // 3. Run scheduler & worker
    await scheduler.step();
    await worker.step();
    await scheduler.step();

    // 4. Verify partially completed batch with output and error files
    const resultJob = await batchService.getBatch(authContext, batch.id);
    expect(resultJob.status).toBe("partially_completed");
    expect(resultJob.succeededItems).toBe(1);
    expect(resultJob.failedItems).toBe(1);
    expect(resultJob.outputFileId).toBeTruthy();
    expect(resultJob.errorFileId).toBeTruthy();

    const errStream = await fileService.getFileContentStream(tenant, resultJob.errorFileId!);
    const errText = (errStream.body as Buffer).toString("utf8");
    expect(errText).toContain('"custom_id":"task-2-fail"');
    expect(errText).toContain("Invalid prompt parameter");
  });

  it("handles batch cancellation and halts unprocessed items", async () => {
    const batch = await batchService.createBatch(authContext, {
      items: [
        { custom_id: "c-1", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] } },
        { custom_id: "c-2", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "2" }] } },
      ],
    });

    const cancelled = await batchService.cancelBatch(authContext, batch.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).toBeTruthy();

    const items = await batchService.listBatchItems(authContext, batch.id);
    expect(items.data.every(i => i.status === "cancelled")).toBe(true);
  });

  it("enforces tenant isolation — cannot access another org's batch", async () => {
    const batch = await batchService.createBatch(authContext, {
      items: [{ custom_id: "t-1", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] } }],
    });

    const otherTenantAuth: MachineAuthContext = {
      ...authContext,
      organizationId: "org_beta_intruder",
    };

    await expect(batchService.getBatch(otherTenantAuth, batch.id)).rejects.toThrow(/not found/);
    await expect(batchService.cancelBatch(otherTenantAuth, batch.id)).rejects.toThrow(/not found/);
  });

  it("handles idempotency key deduplication", async () => {
    const batch1 = await batchService.createBatch(
      authContext,
      {
        items: [{ custom_id: "idem-1", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] } }],
      },
      "unique-idem-key-999"
    );

    const batch2 = await batchService.createBatch(
      authContext,
      {
        items: [{ custom_id: "idem-1", method: "POST", url: "/v1/chat/completions", body: { model: "gpt-4o", messages: [{ role: "user", content: "1" }] } }],
      },
      "unique-idem-key-999"
    );

    expect(batch1.id).toBe(batch2.id);
  });
});
