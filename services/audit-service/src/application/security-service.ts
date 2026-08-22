import { generateId } from "@growx/ids";
import {
  SecurityDetectionEngine,
  type AuditActorType,
  type SecurityEvent,
  type SecurityEventCategory,
  type SecurityEventStatus,
  type SecuritySeverity,
  type SecuritySignal,
} from "@growx/audit";
import type {
  IAuditRepository,
  ListSecurityEventsParams,
  ListSecuritySignalsParams,
} from "../domain/types.js";

export interface RecordSecurityEventInput {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  category: SecurityEventCategory;
  type: string;
  severity: SecuritySeverity;
  actorType?: AuditActorType | undefined;
  actorId?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  requestId?: string | undefined;
  sourceService: string;
  ipAddress?: string | undefined;
  fingerprint?: string | undefined;
  evidence?: Record<string, unknown> | undefined;
  occurredAt?: Date | undefined;
}

export interface IncidentTimelineItem {
  id: string;
  timestamp: Date;
  kind: "audit" | "security";
  actionOrType: string;
  severity?: SecuritySeverity | undefined;
  actorId?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  sourceService: string;
  details: Record<string, unknown>;
}

export class SecurityService {
  private readonly detectionEngine: SecurityDetectionEngine;

  constructor(private readonly repository: IAuditRepository) {
    this.detectionEngine = new SecurityDetectionEngine();
  }

  /**
   * Ingests an immutable security event, evaluates detection rules, and correlates signals.
   */
  async recordSecurityEvent(input: RecordSecurityEventInput): Promise<{
    securityEvent: SecurityEvent;
    signal?: SecuritySignal | undefined;
  }> {
    const now = new Date();
    const occurredAt = input.occurredAt ?? now;
    const fingerprint =
      input.fingerprint ??
      `${input.type}:${input.organizationId ?? "global"}:${
        input.resourceId ?? input.actorId ?? "none"
      }`;

    const eventId = generateId("sec");
    const securityEvent: SecurityEvent = {
      id: eventId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      category: input.category,
      type: input.type,
      severity: input.severity,
      actorType: input.actorType,
      actorId: input.actorId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      sourceService: input.sourceService,
      ipAddress: input.ipAddress,
      fingerprint,
      evidence: input.evidence ?? {},
      occurredAt,
      ingestedAt: now,
    };

    // 1. Persist raw security event (immutable fact)
    await this.repository.createSecurityEvent(securityEvent);

    // 2. Evaluate detection rules and signal correlation
    const existingSignal =
      await this.repository.getSecuritySignalByFingerprint(fingerprint);

    const signalResult = this.detectionEngine.processEvent(
      securityEvent,
      existingSignal,
    );

    let signal: SecuritySignal | undefined;
    if (signalResult) {
      if (existingSignal) {
        signal = await this.repository.updateSecuritySignal(
          existingSignal.id,
          signalResult,
        );
      } else {
        signal = await this.repository.createSecuritySignal(signalResult);
      }
    }

    return { securityEvent, signal };
  }

  async listSecurityEvents(
    organizationId?: string | undefined,
    filters?: Omit<ListSecurityEventsParams, "organizationId"> | undefined,
  ): Promise<SecurityEvent[]> {
    return this.repository.listSecurityEvents({
      ...filters,
      organizationId,
    });
  }

  async listSecuritySignals(
    organizationId?: string | undefined,
    filters?: Omit<ListSecuritySignalsParams, "organizationId"> | undefined,
  ): Promise<SecuritySignal[]> {
    return this.repository.listSecuritySignals({
      ...filters,
      organizationId,
    });
  }

  async updateSignalStatus(
    id: string,
    status: SecurityEventStatus,
  ): Promise<SecuritySignal> {
    return this.repository.updateSecuritySignal(id, { status });
  }

  /**
   * Constructs a correlated investigation timeline from both audit and security events.
   */
  async buildIncidentTimeline(params: {
    organizationId?: string | undefined;
    requestId?: string | undefined;
    actorId?: string | undefined;
    resourceId?: string | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  }): Promise<IncidentTimelineItem[]> {
    const [auditList, securityList] = await Promise.all([
      this.repository.listAuditEvents(params),
      this.repository.listSecurityEvents(params),
    ]);

    const timeline: IncidentTimelineItem[] = [];

    for (const a of auditList) {
      timeline.push({
        id: a.id,
        timestamp: a.occurredAt,
        kind: "audit",
        actionOrType: a.action,
        actorId: a.actorId,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        sourceService: a.sourceService,
        details: {
          outcome: a.outcome,
          privileged: a.privileged,
          jitSessionId: a.jitSessionId,
          breakGlass: a.breakGlass,
          metadata: a.metadata,
        },
      });
    }

    for (const s of securityList) {
      timeline.push({
        id: s.id,
        timestamp: s.occurredAt,
        kind: "security",
        actionOrType: s.type,
        severity: s.severity,
        actorId: s.actorId,
        resourceType: s.resourceType,
        resourceId: s.resourceId,
        sourceService: s.sourceService,
        details: {
          category: s.category,
          fingerprint: s.fingerprint,
          evidence: s.evidence,
        },
      });
    }

    // Sort chronologically
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline;
  }
}
