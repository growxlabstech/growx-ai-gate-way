import type { ApiKeyRecord } from "../domain/types.js";

export type AuditAction =
  | "api_key.created"
  | "api_key.updated"
  | "api_key.revoked"
  | "api_key.rotated"
  | "api_key.permissions.updated"
  | "api_key.model_rules.updated"
  | "api_key.rate_limits.updated"
  | "api_key.spending_limit.updated"
  | "api_key.ip_allowlist.updated";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export interface LifecycleEvents {
  audit(
    action: AuditAction,
    record: ApiKeyRecord,
    actorId: string,
    metadata?: Record<string, unknown> | undefined,
  ): Promise<void>;
  publish(
    eventType: string,
    record: ApiKeyRecord,
    actorId: string,
    payload?: Record<string, unknown> | undefined,
  ): Promise<void>;
  invalidate(apiKeyId: string): Promise<void>;
  securityEvent(
    eventType: string,
    severity: SecuritySeverity,
    details: Record<string, unknown>,
  ): Promise<void>;
}

export class InMemoryLifecycleEvents implements LifecycleEvents {
  readonly auditEvents: Array<{
    action: AuditAction;
    record: ApiKeyRecord;
    actorId: string;
    metadata?: Record<string, unknown> | undefined;
  }> = [];
  readonly publishedEvents: Array<{
    eventType: string;
    record: ApiKeyRecord;
    actorId: string;
    payload?: Record<string, unknown> | undefined;
  }> = [];
  readonly invalidatedKeys: string[] = [];
  readonly securityEvents: Array<{
    eventType: string;
    severity: SecuritySeverity;
    details: Record<string, unknown>;
  }> = [];

  async audit(
    action: AuditAction,
    record: ApiKeyRecord,
    actorId: string,
    metadata?: Record<string, unknown> | undefined,
  ): Promise<void> {
    this.auditEvents.push({ action, record, actorId, metadata });
  }

  async publish(
    eventType: string,
    record: ApiKeyRecord,
    actorId: string,
    payload?: Record<string, unknown> | undefined,
  ): Promise<void> {
    this.publishedEvents.push({ eventType, record, actorId, payload });
  }

  async invalidate(apiKeyId: string): Promise<void> {
    this.invalidatedKeys.push(apiKeyId);
  }

  async securityEvent(
    eventType: string,
    severity: SecuritySeverity,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.securityEvents.push({ eventType, severity, details });
  }
}
