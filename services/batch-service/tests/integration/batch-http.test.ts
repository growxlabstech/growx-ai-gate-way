import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBatchRepository } from "../../src/infrastructure/batch-repository.js";
import { BatchService } from "../../src/application/batch-service.js";
import { BatchReconciler } from "../../src/application/batch-reconciler.js";
import { BatchFinalizer } from "../../src/application/batch-finalizer.js";
import { BatchHttpRouter } from "../../src/transport/http-server.js";
import type { MachineAuthContext } from "@growx/api-key-service";

describe("Batch HTTP Router Integration", () => {
  let router: BatchHttpRouter;
  let batchService: BatchService;

  const authContext: MachineAuthContext = {
    actorType: "apiKey",
    apiKeyId: "key_http_test",
    organizationId: "org_http",
    workspaceId: "ws_http",
    environmentId: "env_http",
    environment: "production",
    name: "HTTP Batch Key",
    permissions: ["batches.create", "batches.read", "batches.cancel", "chat.completions.create"],
    modelRules: [],
    ipAllowlist: [],
    rateLimits: [],
    createdBy: "usr_http",
    createdAt: new Date(),
    expiresAt: null,
    lastUsedAt: new Date(),
  };

  beforeEach(() => {
    const repo = new InMemoryBatchRepository();
    const finalizer = new BatchFinalizer({ batchRepository: repo });
    const reconciler = new BatchReconciler({ batchRepository: repo, finalizer });
    batchService = new BatchService({ batchRepository: repo, finalizer });
    router = new BatchHttpRouter({ batchService, reconciler });
  });

  it("handles POST /v1/batches", async () => {
    const res = await router.handleCreateBatch(authContext, {
      items: [
        {
          custom_id: "http-item-1",
          method: "POST",
          url: "/v1/chat/completions",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        },
      ],
      completion_window: "6h",
    });

    expect(res.status).toBe(201);
    const body: any = res.body;
    expect(body.batch.id).toMatch(/^batch_/);
    expect(body.batch.totalItems).toBe(1);
    expect(body.batch.completionWindow).toBe("6h");
  });

  it("handles GET /v1/batches/:id and list", async () => {
    const created: any = await router.handleCreateBatch(authContext, {
      items: [
        {
          custom_id: "http-item-2",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        },
      ],
    });

    const getRes = await router.handleGetBatch(authContext, created.body.batch.id);
    expect(getRes.status).toBe(200);

    const listRes = await router.handleListBatches(authContext, { limit: 10 });
    expect(listRes.status).toBe(200);
    const listBody: any = listRes.body;
    expect(listBody.data.length).toBe(1);
  });

  it("handles POST /v1/batches/:id/cancel", async () => {
    const created: any = await router.handleCreateBatch(authContext, {
      items: [
        {
          custom_id: "http-item-cancel",
          body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        },
      ],
    });

    const cancelRes = await router.handleCancelBatch(authContext, created.body.batch.id);
    expect(cancelRes.status).toBe(200);
    const cancelBody: any = cancelRes.body;
    expect(cancelBody.status).toBe("cancelled");
  });

  it("handles POST /internal/batches/reconcile", async () => {
    const res = await router.handleInternalReconcile();
    expect(res.status).toBe(200);
    const body: any = res.body;
    expect(body.recoveredLeases).toBeDefined();
    expect(body.reconciledJobs).toBeDefined();
  });
});
