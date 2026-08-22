import type {
  AuditChainHead,
  AuditEvent,
  AuditIntegrityCheckpoint,
  SecurityDetectionRule,
  SecurityEvent,
  SecuritySignal,
} from "@growx/audit";

export interface ListAuditEventsParams {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  actorId?: string | undefined;
  action?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  requestId?: string | undefined;
  traceId?: string | undefined;
  chainScope?: string | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListSecurityEventsParams {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  category?: string | undefined;
  type?: string | undefined;
  severity?: string | undefined;
  actorId?: string | undefined;
  requestId?: string | undefined;
  fingerprint?: string | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  limit?: number | undefined;
}

export interface ListSecuritySignalsParams {
  organizationId?: string | undefined;
  severity?: string | undefined;
  status?: string | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  limit?: number | undefined;
}

export interface SecurityCase {
  id: string;
  title: string;
  status: string;
  severity: string;
  organizationId?: string | undefined;
  assignedTo?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuditRepository {
  // ─── Audit Events & Tamper Chain ─────────────────────────────
  appendAuditEvent(event: AuditEvent): Promise<AuditEvent>;
  getAuditEvent(id: string): Promise<AuditEvent | undefined>;
  listAuditEvents(params: ListAuditEventsParams): Promise<AuditEvent[]>;
  getChainHead(chainScope: string): Promise<AuditChainHead | undefined>;
  updateChainHead(head: AuditChainHead): Promise<void>;
  createCheckpoint(
    checkpoint: AuditIntegrityCheckpoint,
  ): Promise<AuditIntegrityCheckpoint>;
  listCheckpoints(chainScope: string): Promise<AuditIntegrityCheckpoint[]>;

  // ─── Security Events ─────────────────────────────────────────
  createSecurityEvent(event: SecurityEvent): Promise<SecurityEvent>;
  getSecurityEvent(id: string): Promise<SecurityEvent | undefined>;
  listSecurityEvents(
    params: ListSecurityEventsParams,
  ): Promise<SecurityEvent[]>;

  // ─── Security Signals ────────────────────────────────────────
  createSecuritySignal(signal: SecuritySignal): Promise<SecuritySignal>;
  getSecuritySignal(id: string): Promise<SecuritySignal | undefined>;
  getSecuritySignalByFingerprint(
    fingerprint: string,
  ): Promise<SecuritySignal | undefined>;
  updateSecuritySignal(
    id: string,
    updates: Partial<SecuritySignal>,
  ): Promise<SecuritySignal>;
  listSecuritySignals(
    params: ListSecuritySignalsParams,
  ): Promise<SecuritySignal[]>;

  // ─── Detection Rules ─────────────────────────────────────────
  listDetectionRules(): Promise<SecurityDetectionRule[]>;

  // ─── Security Cases ──────────────────────────────────────────
  createSecurityCase(securityCase: SecurityCase): Promise<SecurityCase>;
  getSecurityCase(id: string): Promise<SecurityCase | undefined>;
  listSecurityCases(params: {
    organizationId?: string;
    status?: string;
  }): Promise<SecurityCase[]>;
}
