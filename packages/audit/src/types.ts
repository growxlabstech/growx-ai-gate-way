export type AuditActorType =
  "user" | "api_key" | "service" | "operator" | "system" | "worker";

export type AuditOutcome = "success" | "denied" | "failed" | "partial";

export interface AuditEvent {
  id: string;
  sequence: number;
  chainScope: string; // e.g. "org:org_123" or "global:operator"
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
  privileged: boolean;
  jitSessionId?: string | undefined;
  reason?: string | undefined;
  breakGlass?: boolean | undefined;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  ingestedAt: Date;
  previousHash?: string | undefined;
  eventHash?: string | undefined;
}

export interface AuditChainHead {
  chainScope: string;
  lastSequence: number;
  lastHash: string;
  updatedAt: Date;
}

export interface AuditIntegrityCheckpoint {
  id: string;
  chainScope: string;
  lastSequence: number;
  lastEventHash: string;
  signedHash?: string | undefined;
  keyVersion?: number | undefined;
  createdAt: Date;
}

export type SecurityEventCategory =
  | "authentication"
  | "authorization"
  | "credential"
  | "tenant_isolation"
  | "network"
  | "webhook"
  | "payment"
  | "wallet"
  | "policy"
  | "provider"
  | "abuse"
  | "privileged_access"
  | "data_access";

export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityEventStatus =
  "new" | "acknowledged" | "investigating" | "resolved" | "false_positive";

export interface SecurityEvent {
  id: string;
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
  fingerprint: string;
  evidence: Record<string, unknown>;
  occurredAt: Date;
  ingestedAt: Date;
}

export interface SecuritySignal {
  id: string;
  fingerprint: string;
  type: string;
  severity: SecuritySeverity;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  organizationId?: string | undefined;
  status: SecurityEventStatus;
  lastSecurityEventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecurityDetectionRule {
  id: string;
  type: string;
  enabled: boolean;
  windowSeconds: number;
  threshold: number;
  severity: SecuritySeverity;
  cooldownSeconds: number;
  scope: "organization" | "global";
  version: number;
}
