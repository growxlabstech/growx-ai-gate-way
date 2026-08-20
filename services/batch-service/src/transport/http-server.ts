import {
  createBatchRequestSchema,
  batchListQuerySchema,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { BatchService } from "../application/batch-service.js";
import type { BatchReconciler } from "../application/batch-reconciler.js";
import { BatchDomainError } from "../domain/types.js";

export interface BatchHttpHandlerDeps {
  batchService: BatchService;
  reconciler?: BatchReconciler;
}

export class BatchHttpRouter {
  private readonly batchService: BatchService;
  private readonly reconciler?: BatchReconciler;

  constructor(deps: BatchHttpHandlerDeps) {
    this.batchService = deps.batchService;
    this.reconciler = deps.reconciler;
  }

  /**
   * POST /v1/batches
   */
  public async handleCreateBatch(
    auth: MachineAuthContext,
    body: unknown,
    idempotencyKey?: string
  ): Promise<{ status: number; body: unknown }> {
    try {
      const parsed = createBatchRequestSchema.parse(body);
      const batch = await this.batchService.createBatch(auth, parsed, idempotencyKey);
      return { status: 201, body: { batch } };
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  /**
   * GET /v1/batches/:id
   */
  public async handleGetBatch(
    auth: MachineAuthContext,
    id: string
  ): Promise<{ status: number; body: unknown }> {
    try {
      const batch = await this.batchService.getBatch(auth, id);
      return { status: 200, body: batch };
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  /**
   * GET /v1/batches
   */
  public async handleListBatches(
    auth: MachineAuthContext,
    query: unknown
  ): Promise<{ status: number; body: unknown }> {
    try {
      const parsedQuery = batchListQuerySchema.parse(query);
      const result = await this.batchService.listBatches(auth, parsedQuery);
      return { status: 200, body: result };
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  /**
   * POST /v1/batches/:id/cancel
   */
  public async handleCancelBatch(
    auth: MachineAuthContext,
    id: string
  ): Promise<{ status: number; body: unknown }> {
    try {
      const batch = await this.batchService.cancelBatch(auth, id);
      return { status: 200, body: batch };
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  /**
   * GET /v1/batches/:id/items
   */
  public async handleListBatchItems(
    auth: MachineAuthContext,
    id: string,
    limit?: number,
    cursor?: string
  ): Promise<{ status: number; body: unknown }> {
    try {
      const items = await this.batchService.listBatchItems(auth, id, limit, cursor);
      return { status: 200, body: items };
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  /**
   * POST /internal/batches/reconcile
   */
  public async handleInternalReconcile(): Promise<{ status: number; body: unknown }> {
    if (!this.reconciler) {
      return { status: 501, body: { error: "Reconciler not enabled" } };
    }
    const res = await this.reconciler.reconcile();
    return { status: 200, body: res };
  }

  private handleError(err: any): { status: number; body: unknown } {
    if (err instanceof BatchDomainError) {
      return {
        status: err.statusCode,
        body: {
          error: {
            message: err.message,
            code: err.code,
            details: err.details,
          },
        },
      };
    }
    if (err?.name === "ZodError") {
      return {
        status: 400,
        body: {
          error: {
            message: "Validation failed",
            code: "invalid_request",
            details: err.issues,
          },
        },
      };
    }
    return {
      status: 500,
      body: {
        error: {
          message: err?.message ?? "Internal batch service error",
          code: "internal_error",
        },
      },
    };
  }
}
