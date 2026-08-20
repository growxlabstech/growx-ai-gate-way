import type {
  BatchJobStatus,
  BatchItemStatus,
  BatchCompletionWindow,
  BatchEndpoint,
  BatchItemRequest,
  BatchJob,
  BatchItem,
  BatchOutputRecord,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";

export type {
  BatchJobStatus,
  BatchItemStatus,
  BatchCompletionWindow,
  BatchEndpoint,
  BatchItemRequest,
  BatchJob,
  BatchItem,
  BatchOutputRecord,
  MachineAuthContext,
};

export interface BatchJobRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  createdByUserId?: string | null;
  createdByApiKeyId?: string | null;
  inputFileId?: string | null;
  outputFileId?: string | null;
  errorFileId?: string | null;
  endpoint: BatchEndpoint;
  status: BatchJobStatus;
  completionWindow: BatchCompletionWindow;
  metadata: Record<string, unknown>;
  totalItems: number;
  pendingItems: number;
  runningItems: number;
  succeededItems: number;
  failedItems: number;
  cancelledItems: number;
  errorSummary?: Record<string, unknown> | null;
  executionDeadlineAt?: Date | null;
  validatedAt?: Date | null;
  queuedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchItemRecord {
  id: string;
  batchId: string;
  organizationId: string;
  customId: string;
  position: number;
  requestPayload: OpenAIChatCompletionRequest;
  requestHash?: string | null;
  status: BatchItemStatus;
  attemptCount: number;
  maxAttempts: number;
  gatewayRequestId?: string | null;
  responsePayload?: OpenAIChatCompletionResponse | null;
  responseReference?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorCategory?: string | null;
  retryAfterAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchItemAttemptRecord {
  id: string;
  batchItemId: string;
  batchId: string;
  attemptNumber: number;
  executionId: string;
  gatewayRequestId?: string | null;
  status: "succeeded" | "failed" | "cancelled";
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable: boolean;
  latencyMs?: number | null;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface BatchChunkRecord {
  id: string;
  batchId: string;
  sequence: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  itemCount: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

export interface BatchLeaseRecord {
  id: string;
  resourceType: string;
  resourceId: string;
  leaseOwner: string;
  expiresAt: Date;
  acquiredAt: Date;
}

export interface BatchExecutionReservationRecord {
  id: string;
  batchId: string;
  organizationId: string;
  reservedCreditsAmount: string;
  settledCreditsAmount: string;
  status: "reserved" | "partially_settled" | "settled" | "released";
  createdAt: Date;
  settledAt?: Date | null;
  releasedAt?: Date | null;
}

export interface BatchIdempotencyRecord {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  requestHash: string;
  batchId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class BatchDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "BatchDomainError";
  }
}

export class BatchNotFoundError extends BatchDomainError {
  constructor(batchId: string) {
    super(`Batch ${batchId} not found`, "batch_not_found", 404);
  }
}

export class BatchItemNotFoundError extends BatchDomainError {
  constructor(itemId: string) {
    super(`Batch item ${itemId} not found`, "batch_item_not_found", 404);
  }
}

export class BatchValidationError extends BatchDomainError {
  constructor(message: string, details?: unknown) {
    super(message, "invalid_batch_input", 400, details);
  }
}

export class BatchConcurrencyError extends BatchDomainError {
  constructor(message: string) {
    super(message, "concurrency_conflict", 409);
  }
}

export class BatchCancellationError extends BatchDomainError {
  constructor(message: string) {
    super(message, "batch_cancelled", 400);
  }
}
