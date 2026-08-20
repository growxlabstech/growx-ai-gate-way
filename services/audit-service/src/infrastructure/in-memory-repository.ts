import {
  DEFAULT_SECURITY_DETECTION_RULES,
  type AuditChainHead,
  type AuditEvent,
  type AuditIntegrityCheckpoint,
  type SecurityDetectionRule,
  type SecurityEvent,
  type SecuritySignal,
} from "@growx/audit";
import type {
  IAuditRepository,
  ListAuditEventsParams,
  ListSecurityEventsParams,
  ListSecuritySignalsParams,
  SecurityCase,
} from "../domain/types.js";

export class InMemoryAuditRepository implements IAuditRepository {
  public readonly auditEvents: Map<string, AuditEvent> = new Map();
  public readonly chainHeads: Map<string, AuditChainHead> = new Map();
  public readonly checkpoints: Map<string, AuditIntegrityCheckpoint[]> = new Map();

  public readonly securityEvents: Map<string, SecurityEvent> = new Map();
  public readonly securitySignals: Map<string, SecuritySignal> = new Map();
  public readonly detectionRules: Map<string, SecurityDetectionRule> = new Map();
  public readonly securityCases: Map<string, SecurityCase> = new Map();

  constructor() {
    for (const rule of DEFAULT_SECURITY_DETECTION_RULES) {
      this.detectionRules.set(rule.type, rule);
    }
  }

  // ─── Audit Events & Tamper Chain ─────────────────────────────
  async appendAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    this.auditEvents.set(event.id, event);
    return event;
  }

  async getAuditEvent(id: string): Promise<AuditEvent | undefined> {
    return this.auditEvents.get(id);
  }

  async listAuditEvents(params: ListAuditEventsParams): Promise<AuditEvent[]> {
    let results = Array.from(this.auditEvents.values());

    if (params.chainScope) {
      results = results.filter((e) => e.chainScope === params.chainScope);
    }
    if (params.organizationId) {
      results = results.filter((e) => e.organizationId === params.organizationId);
    }
    if (params.workspaceId) {
      results = results.filter((e) => e.workspaceId === params.workspaceId);
    }
    if (params.actorId) {
      results = results.filter((e) => e.actorId === params.actorId);
    }
    if (params.action) {
      results = results.filter((e) => e.action === params.action);
    }
    if (params.resourceType) {
      results = results.filter((e) => e.resourceType === params.resourceType);
    }
    if (params.resourceId) {
      results = results.filter((e) => e.resourceId === params.resourceId);
    }
    if (params.requestId) {
      results = results.filter((e) => e.requestId === params.requestId);
    }
    if (params.traceId) {
      results = results.filter((e) => e.traceId === params.traceId);
    }
    if (params.fromDate) {
      results = results.filter((e) => e.occurredAt >= params.fromDate!);
    }
    if (params.toDate) {
      results = results.filter((e) => e.occurredAt <= params.toDate!);
    }

    // Sort chronologically by sequence / occurredAt
    results.sort((a, b) => a.sequence - b.sequence);

    if (params.cursor) {
      const idx = results.findIndex((e) => e.id === params.cursor);
      if (idx !== -1) {
        results = results.slice(idx + 1);
      }
    }

    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  async getChainHead(chainScope: string): Promise<AuditChainHead | undefined> {
    return this.chainHeads.get(chainScope);
  }

  async updateChainHead(head: AuditChainHead): Promise<void> {
    this.chainHeads.set(head.chainScope, head);
  }

  async createCheckpoint(
    checkpoint: AuditIntegrityCheckpoint
  ): Promise<AuditIntegrityCheckpoint> {
    const list = this.checkpoints.get(checkpoint.chainScope) ?? [];
    list.push(checkpoint);
    this.checkpoints.set(checkpoint.chainScope, list);
    return checkpoint;
  }

  async listCheckpoints(chainScope: string): Promise<AuditIntegrityCheckpoint[]> {
    return this.checkpoints.get(chainScope) ?? [];
  }

  // ─── Security Events ─────────────────────────────────────────
  async createSecurityEvent(event: SecurityEvent): Promise<SecurityEvent> {
    this.securityEvents.set(event.id, event);
    return event;
  }

  async getSecurityEvent(id: string): Promise<SecurityEvent | undefined> {
    return this.securityEvents.get(id);
  }

  async listSecurityEvents(params: ListSecurityEventsParams): Promise<SecurityEvent[]> {
    let results = Array.from(this.securityEvents.values());

    if (params.organizationId) {
      results = results.filter((e) => e.organizationId === params.organizationId);
    }
    if (params.workspaceId) {
      results = results.filter((e) => e.workspaceId === params.workspaceId);
    }
    if (params.category) {
      results = results.filter((e) => e.category === params.category);
    }
    if (params.type) {
      results = results.filter((e) => e.type === params.type);
    }
    if (params.severity) {
      results = results.filter((e) => e.severity === params.severity);
    }
    if (params.actorId) {
      results = results.filter((e) => e.actorId === params.actorId);
    }
    if (params.requestId) {
      results = results.filter((e) => e.requestId === params.requestId);
    }
    if (params.fingerprint) {
      results = results.filter((e) => e.fingerprint === params.fingerprint);
    }
    if (params.fromDate) {
      results = results.filter((e) => e.occurredAt >= params.fromDate!);
    }
    if (params.toDate) {
      results = results.filter((e) => e.occurredAt <= params.toDate!);
    }

    results.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  // ─── Security Signals ────────────────────────────────────────
  async createSecuritySignal(signal: SecuritySignal): Promise<SecuritySignal> {
    this.securitySignals.set(signal.id, signal);
    return signal;
  }

  async getSecuritySignal(id: string): Promise<SecuritySignal | undefined> {
    return this.securitySignals.get(id);
  }

  async getSecuritySignalByFingerprint(
    fingerprint: string
  ): Promise<SecuritySignal | undefined> {
    for (const s of this.securitySignals.values()) {
      if (s.fingerprint === fingerprint) return s;
    }
    return undefined;
  }

  async updateSecuritySignal(
    id: string,
    updates: Partial<SecuritySignal>
  ): Promise<SecuritySignal> {
    const existing = this.securitySignals.get(id);
    if (!existing) throw new Error(`Security signal not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.securitySignals.set(id, updated);
    return updated;
  }

  async listSecuritySignals(params: ListSecuritySignalsParams): Promise<SecuritySignal[]> {
    let results = Array.from(this.securitySignals.values());

    if (params.organizationId) {
      results = results.filter((s) => s.organizationId === params.organizationId);
    }
    if (params.severity) {
      results = results.filter((s) => s.severity === params.severity);
    }
    if (params.status) {
      results = results.filter((s) => s.status === params.status);
    }
    if (params.fromDate) {
      results = results.filter((s) => s.lastSeenAt >= params.fromDate!);
    }
    if (params.toDate) {
      results = results.filter((s) => s.lastSeenAt <= params.toDate!);
    }

    results.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());

    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  // ─── Detection Rules ─────────────────────────────────────────
  async listDetectionRules(): Promise<SecurityDetectionRule[]> {
    return Array.from(this.detectionRules.values());
  }

  // ─── Security Cases ──────────────────────────────────────────
  async createSecurityCase(securityCase: SecurityCase): Promise<SecurityCase> {
    this.securityCases.set(securityCase.id, securityCase);
    return securityCase;
  }

  async getSecurityCase(id: string): Promise<SecurityCase | undefined> {
    return this.securityCases.get(id);
  }

  async listSecurityCases(params: {
    organizationId?: string | undefined;
    status?: string | undefined;
  }): Promise<SecurityCase[]> {
    let results = Array.from(this.securityCases.values());
    if (params.organizationId) {
      results = results.filter((c) => c.organizationId === params.organizationId);
    }
    if (params.status) {
      results = results.filter((c) => c.status === params.status);
    }
    return results;
  }
}
