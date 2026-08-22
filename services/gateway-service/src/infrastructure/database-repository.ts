import {
  errorRecords,
  gatewayRequests,
  latencyRecords,
  providerAttempts,
  tokenUsageRecords,
  usageRecords,
} from "@growx/database";
import { eq } from "drizzle-orm";
import type { IGatewayRepository } from "../application/repository.js";
import type {
  GatewayAttemptEntity,
  GatewayErrorRecord,
  GatewayLatencyRecord,
  GatewayRequestEntity,
  GatewayUsageSnapshot,
} from "../domain/types.js";

export class DatabaseGatewayRepository implements IGatewayRepository {
  constructor(private readonly db: any) {}

  async createRequest(request: GatewayRequestEntity): Promise<void> {
    await this.db.insert(gatewayRequests).values({
      id: request.id,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      apiKeyId: request.apiKeyId,
      requestedModel: request.requestedModel,
      resolvedModel: request.resolvedModel,
      status: request.status,
      stream: request.stream,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      latencyMs: request.latencyMs,
      errorCode: request.errorCode,
      createdAt: request.createdAt,
    });
  }

  async updateRequest(
    id: string,
    updates: Partial<GatewayRequestEntity>,
  ): Promise<void> {
    const values: Record<string, unknown> = {};
    if (updates.status !== undefined) values.status = updates.status;
    if (updates.completedAt !== undefined)
      values.completedAt = updates.completedAt;
    if (updates.latencyMs !== undefined) values.latencyMs = updates.latencyMs;
    if (updates.errorCode !== undefined) values.errorCode = updates.errorCode;
    if (updates.resolvedModel !== undefined)
      values.resolvedModel = updates.resolvedModel;

    if (Object.keys(values).length > 0) {
      await this.db
        .update(gatewayRequests)
        .set(values)
        .where(eq(gatewayRequests.id, id));
    }
  }

  async getRequest(id: string): Promise<GatewayRequestEntity | null> {
    const rows = await this.db
      .select()
      .from(gatewayRequests)
      .where(eq(gatewayRequests.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      environmentId: row.environmentId,
      apiKeyId: row.apiKeyId,
      requestedModel: row.requestedModel,
      resolvedModel: row.resolvedModel,
      status: row.status as any,
      stream: row.stream,
      providerId: null,
      providerModelId: null,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      latencyMs: row.latencyMs,
      errorCode: row.errorCode,
      finishReason: null,
      createdAt: row.createdAt,
    };
  }

  async saveUsageSnapshot(usage: GatewayUsageSnapshot): Promise<void> {
    await this.db.transaction(async (tx: any) => {
      await tx.insert(usageRecords).values({
        id: usage.id,
        requestId: usage.requestId,
        eventId: `evt_${usage.id}`,
        createdAt: usage.createdAt,
      });

      await tx.insert(tokenUsageRecords).values({
        usageRecordId: usage.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
      });
    });
  }

  async saveLatencyRecord(latency: GatewayLatencyRecord): Promise<void> {
    await this.db.insert(latencyRecords).values({
      id: `lat_${latency.requestId}`,
      requestId: latency.requestId,
      gatewayOverheadMs: latency.gatewayOverheadMs,
      providerLatencyMs: latency.providerLatencyMs,
      timeToFirstTokenMs: latency.timeToFirstTokenMs,
      totalLatencyMs: latency.totalLatencyMs,
    });
  }

  async saveErrorRecord(error: GatewayErrorRecord): Promise<void> {
    await this.db.insert(errorRecords).values({
      id: error.id,
      requestId: error.requestId,
      code: error.code,
      retryable: error.retryable,
      safeMessage: error.safeMessage,
      createdAt: error.createdAt,
    });
  }

  async createAttempt(attempt: GatewayAttemptEntity): Promise<void> {
    await this.db.insert(providerAttempts).values({
      id: attempt.id,
      requestId: attempt.requestId,
      providerId: attempt.providerId,
      providerModelId: attempt.providerModelId,
      attemptNumber: attempt.attemptNumber,
      status:
        attempt.status === "succeeded"
          ? "completed"
          : attempt.status === "executing"
            ? "started"
            : attempt.status,
      startedAt: attempt.startedAt,
      firstTokenAt: attempt.firstTokenAt ?? null,
      completedAt: attempt.completedAt,
      latencyMs: attempt.latencyMs,
      errorCode: attempt.errorCode,
      providerRequestId: attempt.providerRequestId,
    });
  }

  async updateAttempt(
    id: string,
    updates: Partial<GatewayAttemptEntity>,
  ): Promise<void> {
    const values: Record<string, unknown> = {};
    if (updates.status !== undefined) {
      values.status =
        updates.status === "succeeded"
          ? "completed"
          : updates.status === "executing"
            ? "started"
            : updates.status;
    }
    if (updates.firstTokenAt !== undefined)
      values.firstTokenAt = updates.firstTokenAt;
    if (updates.completedAt !== undefined)
      values.completedAt = updates.completedAt;
    if (updates.latencyMs !== undefined) values.latencyMs = updates.latencyMs;
    if (updates.errorCode !== undefined) values.errorCode = updates.errorCode;
    if (updates.providerRequestId !== undefined)
      values.providerRequestId = updates.providerRequestId;

    if (Object.keys(values).length > 0) {
      await this.db
        .update(providerAttempts)
        .set(values)
        .where(eq(providerAttempts.id, id));
    }
  }

  async listAttemptsByRequestId(
    requestId: string,
  ): Promise<GatewayAttemptEntity[]> {
    const rows = await this.db
      .select()
      .from(providerAttempts)
      .where(eq(providerAttempts.requestId, requestId))
      .orderBy(providerAttempts.attemptNumber);

    return rows.map((r: any) => ({
      id: r.id,
      requestId: r.requestId,
      attemptNumber: r.attemptNumber,
      routeId: "",
      providerId: r.providerId,
      providerModelId: r.providerModelId,
      status:
        r.status === "completed"
          ? "succeeded"
          : r.status === "started"
            ? "executing"
            : r.status,
      startedAt: r.startedAt,
      firstTokenAt: r.firstTokenAt,
      completedAt: r.completedAt,
      latencyMs: r.latencyMs,
      errorCode: r.errorCode,
      retryable: false,
      fallbackReason: null,
      providerRequestId: r.providerRequestId,
      emittedClientOutput: Boolean(r.firstTokenAt),
      usage: null,
      createdAt: r.startedAt,
    }));
  }

  async getAttempt(id: string): Promise<GatewayAttemptEntity | null> {
    const rows = await this.db
      .select()
      .from(providerAttempts)
      .where(eq(providerAttempts.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      requestId: r.requestId,
      attemptNumber: r.attemptNumber,
      routeId: "",
      providerId: r.providerId,
      providerModelId: r.providerModelId,
      status:
        r.status === "completed"
          ? "succeeded"
          : r.status === "started"
            ? "executing"
            : r.status,
      startedAt: r.startedAt,
      firstTokenAt: r.firstTokenAt,
      completedAt: r.completedAt,
      latencyMs: r.latencyMs,
      errorCode: r.errorCode,
      retryable: false,
      fallbackReason: null,
      providerRequestId: r.providerRequestId,
      emittedClientOutput: Boolean(r.firstTokenAt),
      usage: null,
      createdAt: r.startedAt,
    };
  }
}
