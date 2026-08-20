import { generateId } from "@growx/ids";
import type {
  GatewayAttemptRecord,
  GatewayRequestRecord,
  GatewayRequestStatus,
  MeteringQuality,
  NormalizedProviderUsage,
  ProviderAttemptStatus,
  TokenUsageSummary,
  UsageConfidence,
  UsageEvent,
  UsageReconciliationRecord,
  UsageSource,
  UsageType,
  WorkloadType,
} from "./types.js";
import type { AggregateQueryOptions, IUsageLedgerRepository } from "./repository.js";
import { TokenEstimator } from "@growx/rate-limits";

export interface OutboxEventEmitter {
  emit(topic: string, payload: Record<string, unknown>): Promise<void>;
}

export interface UsageMeteringServiceOptions {
  repository: IUsageLedgerRepository;
  outbox?: OutboxEventEmitter | undefined;
  tokenEstimator?: TokenEstimator | undefined;
}

export class UsageMeteringService {
  private readonly repository: IUsageLedgerRepository;
  private readonly outbox?: OutboxEventEmitter | undefined;
  private readonly tokenEstimator: TokenEstimator;

  constructor(options: UsageMeteringServiceOptions) {
    this.repository = options.repository;
    this.outbox = options.outbox;
    this.tokenEstimator = options.tokenEstimator ?? new TokenEstimator();
  }

  /**
   * Records that a Gateway request has been accepted/started before execution.
   */
  public async recordRequestStarted(params: {
    requestId: string;
    organizationId: string;
    workspaceId: string;
    apiKeyId?: string | undefined;
    canonicalModelId: string;
    operation?: string | undefined;
    streaming?: boolean | undefined;
    workloadType?: WorkloadType | undefined;
    policyVersionHash?: string | undefined;
    quotaPolicyVersion?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<GatewayRequestRecord> {
    const existing = await this.repository.getRequestRecord(params.requestId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const record: GatewayRequestRecord = {
      id: generateId("gwrq"),
      requestId: params.requestId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      apiKeyId: params.apiKeyId,
      canonicalModelId: params.canonicalModelId,
      operation: params.operation ?? "chat_completion",
      streaming: params.streaming ?? false,
      status: "executing",
      startedAt: now,
      attemptCount: 0,
      retryCount: 0,
      fallbackCount: 0,
      policyVersionHash: params.policyVersionHash,
      quotaPolicyVersion: params.quotaPolicyVersion,
      workloadType: params.workloadType ?? "customer",
      meteringStatus: "pending",
      meteringQuality: "provider_reported",
      logicalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      providerConsumption: { inputTokens: 0, outputTokens: 0, totalTokens: 0, attemptCount: 0, failedAttemptCount: 0 },
      requestMetadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveRequestRecord(record);
    return record;
  }

  /**
   * Records the start of a provider attempt.
   */
  public async recordAttemptStarted(params: {
    attemptId?: string | undefined;
    requestId: string;
    attemptNumber: number;
    providerId: string;
    providerRouteId?: string | undefined;
    providerModelId: string;
    region?: string | undefined;
    retryReason?: string | undefined;
    fallbackReason?: string | undefined;
  }): Promise<GatewayAttemptRecord> {
    const id = params.attemptId ?? generateId("gwatt");
    const now = new Date();

    const record: GatewayAttemptRecord = {
      id,
      requestId: params.requestId,
      attemptNumber: params.attemptNumber,
      providerId: params.providerId,
      providerRouteId: params.providerRouteId,
      providerModelId: params.providerModelId,
      region: params.region,
      status: "started",
      retryReason: params.retryReason,
      fallbackReason: params.fallbackReason,
      startedAt: now,
      usageSource: "unavailable",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      createdAt: now,
    };

    await this.repository.saveAttemptRecord(record);
    return record;
  }

  /**
   * Records completion of a provider attempt and appends immutable usage events.
   */
  public async recordAttemptCompleted(params: {
    attemptId: string;
    requestId: string;
    completedAt?: Date | undefined;
    durationMs?: number | undefined;
    ttftMs?: number | undefined;
    providerRequestId?: string | undefined;
    usage: NormalizedProviderUsage;
  }): Promise<GatewayAttemptRecord> {
    const attempt = await this.repository.getAttemptRecord(params.attemptId);
    if (!attempt) {
      throw new Error(`Attempt ${params.attemptId} not found`);
    }

    const completedAt = params.completedAt ?? new Date();
    const durationMs = params.durationMs ?? (completedAt.getTime() - attempt.startedAt.getTime());

    const inputTokens = params.usage.inputTokens ?? 0;
    const outputTokens = params.usage.outputTokens ?? 0;
    const totalTokens = params.usage.totalTokens ?? inputTokens + outputTokens;
    const cachedInputTokens = params.usage.cachedInputTokens;
    const reasoningTokens = params.usage.reasoningTokens;

    const updatedAttempt: GatewayAttemptRecord = {
      ...attempt,
      status: "completed",
      completedAt,
      durationMs,
      ttftMs: params.ttftMs,
      providerRequestId: params.providerRequestId,
      usageSource: params.usage.source,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens,
        reasoningTokens,
      },
    };

    await this.repository.saveAttemptRecord(updatedAttempt);

    // Look up parent request for tenant context
    const req = await this.repository.getRequestRecord(params.requestId);
    if (req) {
      await this.appendAttemptUsageEvents(req, updatedAttempt, params.usage.confidence ?? "exact");
    }

    return updatedAttempt;
  }

  /**
   * Records failure of a provider attempt.
   */
  public async recordAttemptFailed(params: {
    attemptId: string;
    requestId: string;
    completedAt?: Date | undefined;
    durationMs?: number | undefined;
    errorCategory?: string | undefined;
    errorCode?: string | undefined;
    usage?: NormalizedProviderUsage | undefined;
  }): Promise<GatewayAttemptRecord> {
    const attempt = await this.repository.getAttemptRecord(params.attemptId);
    if (!attempt) {
      throw new Error(`Attempt ${params.attemptId} not found`);
    }

    const completedAt = params.completedAt ?? new Date();
    const durationMs = params.durationMs ?? (completedAt.getTime() - attempt.startedAt.getTime());

    const inputTokens = params.usage?.inputTokens ?? 0;
    const outputTokens = params.usage?.outputTokens ?? 0;
    const totalTokens = params.usage?.totalTokens ?? inputTokens + outputTokens;

    const updatedAttempt: GatewayAttemptRecord = {
      ...attempt,
      status: "failed",
      completedAt,
      durationMs,
      errorCategory: params.errorCategory,
      errorCode: params.errorCode,
      usageSource: params.usage?.source ?? "unavailable",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens: params.usage?.cachedInputTokens,
        reasoningTokens: params.usage?.reasoningTokens,
      },
    };

    await this.repository.saveAttemptRecord(updatedAttempt);

    // If tokens were consumed prior to failure, ledger them!
    const req = await this.repository.getRequestRecord(params.requestId);
    if (req && (inputTokens > 0 || outputTokens > 0)) {
      await this.appendAttemptUsageEvents(req, updatedAttempt, params.usage?.confidence ?? "exact");
    }

    return updatedAttempt;
  }

  /**
   * Records cancellation of a provider attempt.
   */
  public async recordAttemptCancelled(params: {
    attemptId: string;
    requestId: string;
    completedAt?: Date | undefined;
    durationMs?: number | undefined;
    usage?: NormalizedProviderUsage | undefined;
  }): Promise<GatewayAttemptRecord> {
    const attempt = await this.repository.getAttemptRecord(params.attemptId);
    if (!attempt) {
      throw new Error(`Attempt ${params.attemptId} not found`);
    }

    const completedAt = params.completedAt ?? new Date();
    const durationMs = params.durationMs ?? (completedAt.getTime() - attempt.startedAt.getTime());

    const inputTokens = params.usage?.inputTokens ?? 0;
    const outputTokens = params.usage?.outputTokens ?? 0;
    const totalTokens = params.usage?.totalTokens ?? inputTokens + outputTokens;

    const updatedAttempt: GatewayAttemptRecord = {
      ...attempt,
      status: "cancelled",
      completedAt,
      durationMs,
      usageSource: params.usage?.source ?? "unavailable",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens: params.usage?.cachedInputTokens,
        reasoningTokens: params.usage?.reasoningTokens,
      },
    };

    await this.repository.saveAttemptRecord(updatedAttempt);

    const req = await this.repository.getRequestRecord(params.requestId);
    if (req && (inputTokens > 0 || outputTokens > 0)) {
      await this.appendAttemptUsageEvents(req, updatedAttempt, params.usage?.confidence ?? "exact");
    }

    return updatedAttempt;
  }

  /**
   * Appends immutable usage events for an attempt.
   */
  private async appendAttemptUsageEvents(
    req: GatewayRequestRecord,
    attempt: GatewayAttemptRecord,
    confidence: UsageConfidence
  ): Promise<void> {
    const eventsToAppend: UsageEvent[] = [];
    const now = new Date();

    const pushEvent = (type: UsageType, qty: number) => {
      if (qty > 0) {
        eventsToAppend.push({
          id: generateId("usevt"),
          eventId: generateId("evt"),
          requestId: req.requestId,
          attemptId: attempt.id,
          organizationId: req.organizationId,
          workspaceId: req.workspaceId,
          apiKeyId: req.apiKeyId,
          canonicalModelId: req.canonicalModelId,
          providerId: attempt.providerId,
          providerRouteId: attempt.providerRouteId,
          usageType: type,
          quantity: BigInt(qty),
          unit: "token",
          source: attempt.usageSource,
          confidence,
          workloadType: req.workloadType,
          occurredAt: attempt.completedAt ?? now,
          ingestedAt: now,
          idempotencyKey: `${req.requestId}:${attempt.id}:${type}:${attempt.attemptNumber}`,
        });
      }
    };

    pushEvent("input_tokens", attempt.usage.inputTokens);
    pushEvent("output_tokens", attempt.usage.outputTokens);
    pushEvent("total_tokens", attempt.usage.totalTokens);
    if (attempt.usage.cachedInputTokens) pushEvent("cached_input_tokens", attempt.usage.cachedInputTokens);
    if (attempt.usage.reasoningTokens) pushEvent("reasoning_tokens", attempt.usage.reasoningTokens);

    await this.repository.appendUsageEventsBatch(eventsToAppend);
  }

  /**
   * Finalizes GatewayRequestRecord after execution finishes.
   */
  public async recordRequestCompleted(params: {
    requestId: string;
    status: GatewayRequestStatus;
    completedAt?: Date | undefined;
    durationMs?: number | undefined;
    ttftMs?: number | undefined;
    errorCode?: string | undefined;
    finalAttemptId?: string | undefined;
  }): Promise<GatewayRequestRecord> {
    const req = await this.repository.getRequestRecord(params.requestId);
    if (!req) {
      throw new Error(`Request ${params.requestId} not found`);
    }

    const attempts = await this.repository.listAttemptsForRequest(params.requestId);
    const completedAt = params.completedAt ?? new Date();
    const durationMs = params.durationMs ?? (completedAt.getTime() - req.startedAt.getTime());

    // Compute retry and fallback counts
    const attemptCount = attempts.length;
    let retryCount = 0;
    let fallbackCount = 0;

    for (let i = 1; i < attempts.length; i++) {
      const prev = attempts[i - 1];
      const curr = attempts[i];
      if (curr && prev) {
        if (curr.providerId === prev.providerId) {
          retryCount++;
        } else {
          fallbackCount++;
        }
      }
    }

    // Identify final successful attempt
    const successfulAttempt = attempts.find(
      (a) => (params.finalAttemptId ? a.id === params.finalAttemptId : a.status === "completed")
    ) ?? attempts[attempts.length - 1];

    const logicalUsage: TokenUsageSummary = successfulAttempt && successfulAttempt.status === "completed"
      ? {
          inputTokens: successfulAttempt.usage.inputTokens,
          outputTokens: successfulAttempt.usage.outputTokens,
          totalTokens: successfulAttempt.usage.totalTokens,
          cachedInputTokens: successfulAttempt.usage.cachedInputTokens,
          reasoningTokens: successfulAttempt.usage.reasoningTokens,
        }
      : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Compute total provider consumption across ALL attempts
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalReasoning = 0;
    let failedCount = 0;

    let hasProviderReported = false;
    let hasEstimated = false;
    let hasUnavailable = false;

    for (const a of attempts) {
      totalInput += a.usage.inputTokens;
      totalOutput += a.usage.outputTokens;
      if (a.usage.cachedInputTokens) totalCached += a.usage.cachedInputTokens;
      if (a.usage.reasoningTokens) totalReasoning += a.usage.reasoningTokens;
      if (a.status === "failed") failedCount++;

      if (a.usageSource === "provider_reported" || a.usageSource === "provider_stream_reported") {
        hasProviderReported = true;
      } else if (a.usageSource === "estimated") {
        hasEstimated = true;
      } else if (a.usageSource === "unavailable") {
        hasUnavailable = true;
      }
    }

    let quality: MeteringQuality = "provider_reported";
    if (hasProviderReported && (hasEstimated || hasUnavailable)) {
      quality = "mixed";
    } else if (hasEstimated) {
      quality = "estimated";
    } else if (hasUnavailable && !hasProviderReported) {
      quality = "incomplete";
    }

    const providerConsumption: TokenUsageSummary & { attemptCount: number; failedAttemptCount: number } = {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      cachedInputTokens: totalCached > 0 ? totalCached : undefined,
      reasoningTokens: totalReasoning > 0 ? totalReasoning : undefined,
      attemptCount,
      failedAttemptCount: failedCount,
    };

    const updatedRecord: GatewayRequestRecord = {
      ...req,
      status: params.status,
      completedAt,
      durationMs,
      ttftMs: params.ttftMs,
      finalAttemptId: successfulAttempt?.id,
      attemptCount,
      retryCount,
      fallbackCount,
      errorCode: params.errorCode,
      meteringStatus: quality === "incomplete" ? "incomplete" : "complete",
      meteringQuality: quality,
      logicalUsage,
      providerConsumption,
      updatedAt: new Date(),
    };

    await this.repository.updateRequestRecord(updatedRecord);

    if (this.outbox) {
      await this.outbox.emit("usage.recorded.v1", {
        requestId: updatedRecord.requestId,
        organizationId: updatedRecord.organizationId,
        workspaceId: updatedRecord.workspaceId,
        apiKeyId: updatedRecord.apiKeyId,
        canonicalModelId: updatedRecord.canonicalModelId,
        status: updatedRecord.status,
        logicalUsage,
        providerConsumption,
        quality,
      });
    }

    return updatedRecord;
  }

  /**
   * Records a manual or programmatic compensating adjustment.
   */
  public async recordAdjustment(params: {
    requestId: string;
    usageType: UsageType;
    differenceQuantity: bigint;
    previousQuantity: bigint;
    newQuantity: bigint;
    reason: string;
    operatorId: string;
    attemptId?: string | undefined;
    originalEventId?: string | undefined;
  }): Promise<UsageReconciliationRecord> {
    const req = await this.repository.getRequestRecord(params.requestId);
    if (!req) {
      throw new Error(`Request ${params.requestId} not found`);
    }

    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Adjustment reason is mandatory");
    }

    let providerId: string | undefined = undefined;
    let providerRouteId: string | undefined = undefined;

    if (params.attemptId) {
      const att = await this.repository.getAttemptRecord(params.attemptId);
      if (att) {
        providerId = att.providerId;
        providerRouteId = att.providerRouteId;
      }
    } else if (req.finalAttemptId) {
      const att = await this.repository.getAttemptRecord(req.finalAttemptId);
      if (att) {
        providerId = att.providerId;
        providerRouteId = att.providerRouteId;
      }
    } else {
      const attempts = await this.repository.listAttemptsForRequest(req.requestId);
      const firstAtt = attempts[0];
      if (firstAtt) {
        providerId = firstAtt.providerId;
        providerRouteId = firstAtt.providerRouteId;
      }
    }

    const now = new Date();
    const adjustmentEventId = generateId("usevt");
    const idempotencyKey = `adj:${params.requestId}:${params.usageType}:${params.differenceQuantity.toString()}:${now.getTime()}`;

    const adjustmentEvent: UsageEvent = {
      id: adjustmentEventId,
      eventId: generateId("evt"),
      requestId: req.requestId,
      attemptId: params.attemptId ?? req.finalAttemptId,
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      apiKeyId: req.apiKeyId,
      canonicalModelId: req.canonicalModelId,
      providerId,
      providerRouteId,
      usageType: params.usageType,
      quantity: params.differenceQuantity,
      unit: "token",
      source: "manual_correction",
      confidence: "exact",
      workloadType: req.workloadType,
      occurredAt: now,
      ingestedAt: now,
      idempotencyKey,
      reconciliationGroupId: params.originalEventId,
      reversalOfId: params.originalEventId,
      metadata: { reason: params.reason, operatorId: params.operatorId },
    };

    await this.repository.appendUsageEvent(adjustmentEvent);

    const recRecord: UsageReconciliationRecord = {
      id: generateId("reconc"),
      requestId: params.requestId,
      attemptId: params.attemptId,
      originalEventId: params.originalEventId,
      adjustmentEventId,
      previousQuantity: params.previousQuantity,
      newQuantity: params.newQuantity,
      differenceQuantity: params.differenceQuantity,
      usageType: params.usageType,
      reason: params.reason,
      operatorId: params.operatorId,
      createdAt: now,
    };

    await this.repository.saveReconciliation(recRecord);

    if (this.outbox) {
      await this.outbox.emit("usage.adjusted.v1", {
        requestId: params.requestId,
        adjustmentEventId,
        differenceQuantity: params.differenceQuantity.toString(),
        reason: params.reason,
        operatorId: params.operatorId,
      });
    }

    return recRecord;
  }

  /**
   * Reconciles usage for an estimated request when exact usage arrives later.
   */
  public async reconcileUsage(params: {
    requestId: string;
    actualInputTokens: number;
    actualOutputTokens: number;
    reason?: string | undefined;
    operatorId?: string | undefined;
  }): Promise<void> {
    const req = await this.repository.getRequestRecord(params.requestId);
    if (!req) throw new Error(`Request ${params.requestId} not found`);

    const inputDiff = BigInt(params.actualInputTokens) - BigInt(req.logicalUsage.inputTokens);
    const outputDiff = BigInt(params.actualOutputTokens) - BigInt(req.logicalUsage.outputTokens);

    if (inputDiff !== 0n) {
      await this.recordAdjustment({
        requestId: params.requestId,
        usageType: "input_tokens",
        differenceQuantity: inputDiff,
        previousQuantity: BigInt(req.logicalUsage.inputTokens),
        newQuantity: BigInt(params.actualInputTokens),
        reason: params.reason ?? "Automated reconciliation with actual provider tokens",
        operatorId: params.operatorId ?? "system.reconciliation",
      });
    }

    if (outputDiff !== 0n) {
      await this.recordAdjustment({
        requestId: params.requestId,
        usageType: "output_tokens",
        differenceQuantity: outputDiff,
        previousQuantity: BigInt(req.logicalUsage.outputTokens),
        newQuantity: BigInt(params.actualOutputTokens),
        reason: params.reason ?? "Automated reconciliation with actual provider tokens",
        operatorId: params.operatorId ?? "system.reconciliation",
      });
    }

    // Update request state
    const updated: GatewayRequestRecord = {
      ...req,
      meteringStatus: "reconciled",
      logicalUsage: {
        ...req.logicalUsage,
        inputTokens: params.actualInputTokens,
        outputTokens: params.actualOutputTokens,
        totalTokens: params.actualInputTokens + params.actualOutputTokens,
      },
      updatedAt: new Date(),
    };
    await this.repository.updateRequestRecord(updated);

    if (this.outbox) {
      await this.outbox.emit("usage.reconciled.v1", {
        requestId: params.requestId,
        actualInputTokens: params.actualInputTokens,
        actualOutputTokens: params.actualOutputTokens,
      });
    }
  }

  public async getLogicalUsage(requestId: string): Promise<TokenUsageSummary | null> {
    const req = await this.repository.getRequestRecord(requestId);
    return req ? req.logicalUsage : null;
  }

  public async getProviderConsumption(
    requestId: string
  ): Promise<(TokenUsageSummary & { attemptCount: number; failedAttemptCount: number }) | null> {
    const req = await this.repository.getRequestRecord(requestId);
    return req ? req.providerConsumption : null;
  }

  public async queryAggregates(options: AggregateQueryOptions) {
    return this.repository.queryAggregates(options);
  }

  public async rebuildAggregates() {
    return this.repository.rebuildAggregates();
  }
}
