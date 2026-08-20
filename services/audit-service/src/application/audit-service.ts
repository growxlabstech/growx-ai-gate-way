import { generateId } from "@growx/ids";
import {
  calculateEventHash,
  GENESIS_HASH,
  verifyAuditChain,
  type AuditActorType,
  type AuditChainHead,
  type AuditEvent,
  type AuditIntegrityCheckpoint,
  type AuditOutcome,
  type AuditVerificationResult,
} from "@growx/audit";
import type { IAuditRepository, ListAuditEventsParams } from "../domain/types.js";

export interface RecordAuditEventInput {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  actorType: AuditActorType;
  actorId: string;
  actorSessionId?: string | undefined;
  apiKeyId?: string | undefined;
  servicePrincipalId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  sourceService: string;
  requestId?: string | undefined;
  traceId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  authenticationMethod?: string | undefined;
  privileged?: boolean | undefined;
  jitSessionId?: string | undefined;
  reason?: string | undefined;
  breakGlass?: boolean | undefined;
  outcome?: AuditOutcome | undefined;
  metadata?: Record<string, unknown> | undefined;
  occurredAt?: Date | undefined;
}

export class AuditService {
  private readonly locks: Map<string, Promise<void>> = new Map();

  constructor(
    private readonly repository: IAuditRepository,
    private readonly secretKey?: string | undefined
  ) {}

  /**
   * Acquire an asynchronous mutex lock for a specific chainScope to prevent concurrent sequence races.
   */
  private async acquireLock(chainScope: string): Promise<() => void> {
    while (this.locks.has(chainScope)) {
      await this.locks.get(chainScope);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((res) => {
      resolveLock = res;
    });
    this.locks.set(chainScope, lockPromise);

    return () => {
      this.locks.delete(chainScope);
      resolveLock();
    };
  }

  /**
   * Atomically records an immutable audit event chained to the previous event hash.
   */
  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    const chainScope = input.organizationId
      ? `org:${input.organizationId}`
      : "global:operator";

    const release = await this.acquireLock(chainScope);

    try {
      const now = new Date();
      const occurredAt = input.occurredAt ?? now;

      // 1. Fetch current chain head
      const currentHead = await this.repository.getChainHead(chainScope);
      const sequence = (currentHead?.lastSequence ?? 0) + 1;
      const previousHash = currentHead?.lastHash ?? GENESIS_HASH;

      const eventId = generateId("aud");
      const partialEvent = {
        id: eventId,
        sequence,
        chainScope,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actorType: input.actorType,
        actorId: input.actorId,
        actorSessionId: input.actorSessionId,
        apiKeyId: input.apiKeyId,
        servicePrincipalId: input.servicePrincipalId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        sourceService: input.sourceService,
        requestId: input.requestId,
        traceId: input.traceId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, 500),
        authenticationMethod: input.authenticationMethod,
        privileged: input.privileged ?? false,
        jitSessionId: input.jitSessionId,
        reason: input.reason?.slice(0, 1000),
        breakGlass: input.breakGlass ?? false,
        outcome: input.outcome ?? "success",
        metadata: input.metadata ?? {},
        occurredAt,
        ingestedAt: now,
        previousHash,
      };

      // 2. Compute cryptographic hash
      const eventHash = calculateEventHash(partialEvent, this.secretKey);
      const fullEvent: AuditEvent = { ...partialEvent, eventHash };

      // 3. Persist Event and update Chain Head
      await this.repository.appendAuditEvent(fullEvent);
      await this.repository.updateChainHead({
        chainScope,
        lastSequence: sequence,
        lastHash: eventHash,
        updatedAt: now,
      });

      return fullEvent;
    } finally {
      release();
    }
  }

  /**
   * Helper for recording privileged JIT / Break-Glass actions.
   */
  async recordPrivileged(params: {
    sessionId: string;
    operatorId: string;
    action: string;
    resourceType: string;
    resourceId?: string | undefined;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
    reason: string;
    approvalReference?: string | null | undefined;
    requestId: string;
    result?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    breakGlass?: boolean | undefined;
  }): Promise<AuditEvent> {
    return this.record({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      actorType: "operator",
      actorId: params.operatorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      sourceService: "privileged-access-service",
      requestId: params.requestId,
      privileged: true,
      jitSessionId: params.sessionId,
      reason: params.reason,
      breakGlass: params.breakGlass ?? false,
      outcome: params.result === "denied" ? "denied" : "success",
      metadata: {
        ...params.metadata,
        approvalReference: params.approvalReference,
      },
    });
  }

  /**
   * Verifies the cryptographic integrity of a scope's audit chain.
   */
  async verifyChain(
    chainScope: string,
    initialPreviousHash: string = GENESIS_HASH
  ): Promise<AuditVerificationResult> {
    const events = await this.repository.listAuditEvents({ chainScope });
    return verifyAuditChain(events, initialPreviousHash, this.secretKey);
  }

  /**
   * Creates a signed or hash-based checkpoint of the current chain head.
   */
  async createCheckpoint(chainScope: string): Promise<AuditIntegrityCheckpoint | undefined> {
    const head = await this.repository.getChainHead(chainScope);
    if (!head) return undefined;

    const checkpoint: AuditIntegrityCheckpoint = {
      id: generateId("chk"),
      chainScope,
      lastSequence: head.lastSequence,
      lastEventHash: head.lastHash,
      createdAt: new Date(),
    };

    return this.repository.createCheckpoint(checkpoint);
  }

  // ─── Query Operations ─────────────────────────────────────────

  async listCustomerAuditEvents(
    organizationId: string,
    filters: Omit<ListAuditEventsParams, "organizationId" | "chainScope">
  ): Promise<AuditEvent[]> {
    return this.repository.listAuditEvents({
      ...filters,
      organizationId,
    });
  }

  async getCustomerAuditEvent(
    organizationId: string,
    id: string
  ): Promise<AuditEvent | undefined> {
    const event = await this.repository.getAuditEvent(id);
    if (!event || event.organizationId !== organizationId) {
      return undefined;
    }
    return event;
  }

  async listInternalAuditEvents(filters: ListAuditEventsParams): Promise<AuditEvent[]> {
    return this.repository.listAuditEvents(filters);
  }
}
