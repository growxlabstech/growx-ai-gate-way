import type {
  ApiKeyScope,
  ApiKeyStatus,
  LimitWindow,
  ModelRule,
  PolicyEffect,
  ApiKeyRateLimit,
  ApiKeySpendingLimit,
} from "@growx/contracts";

export type ApiKeyEnvironment =
  "development" | "staging" | "production" | "custom";

export type {
  ApiKeyScope,
  ApiKeyStatus,
  LimitWindow,
  ModelRule,
  PolicyEffect,
  ApiKeyRateLimit,
  ApiKeySpendingLimit,
};

export type DenialCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "expired_api_key"
  | "revoked_api_key"
  | "organization_suspended"
  | "workspace_suspended"
  | "environment_disabled"
  | "permission_denied"
  | "model_not_allowed"
  | "ip_not_allowed"
  | "rate_limit_exceeded"
  | "concurrency_limit_exceeded"
  | "budget_exceeded"
  | "delegation_denied"
  | "quota_exceeded";

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  environment: ApiKeyEnvironment;
  name: string;
  prefix: string;
  secretHash: string;
  status: ApiKeyStatus;
  permissions: readonly ApiKeyScope[];
  modelRules: readonly ModelRule[];
  ipAllowlist: readonly string[];
  rateLimits?: readonly ApiKeyRateLimit[] | undefined;
  spendingLimit?: ApiKeySpendingLimit | null | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

export interface TenantState {
  organizationStatus:
    "active" | "trial" | "restricted" | "suspended" | "archived";
  workspaceStatus: "active" | "restricted" | "suspended" | "archived";
  environmentStatus: "active" | "restricted" | "suspended" | "archived";
}

export interface MachinePrincipal {
  actorType: "apiKey";
  apiKeyId: string;
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  environment: ApiKeyEnvironment;
  name: string;
  permissions: readonly ApiKeyScope[];
  modelRules: readonly ModelRule[];
  ipAllowlist: readonly string[];
  rateLimits: readonly ApiKeyRateLimit[];
  spendingLimit?: ApiKeySpendingLimit | null | undefined;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

export type MachineAuthContext = MachinePrincipal;

export interface CreateApiKeyInput {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  environment: ApiKeyEnvironment;
  name: string;
  permissions?: readonly ApiKeyScope[] | undefined;
  modelRules?: readonly ModelRule[] | undefined;
  ipAllowlist?: readonly string[] | undefined;
  rateLimits?: readonly ApiKeyRateLimit[] | undefined;
  spendingLimit?: ApiKeySpendingLimit | null | undefined;
  createdBy: string;
  creatorCapabilities?: ReadonlySet<string> | undefined;
  expiresAt?: Date | null | undefined;
}

export interface UpdateApiKeyInput {
  name?: string | undefined;
  expiresAt?: Date | null | undefined;
  permissions?: readonly ApiKeyScope[] | undefined;
  modelRules?: readonly ModelRule[] | undefined;
  ipAllowlist?: readonly string[] | undefined;
  actorId: string;
  creatorCapabilities?: ReadonlySet<string> | undefined;
}

export interface RotateApiKeyInput {
  overlapMinutes?: number | undefined;
  reason?: string | undefined;
}

export interface AccessInput {
  authorization?: string | undefined;
  clientIp: string;
  permission?: ApiKeyScope | undefined;
  model?: string | undefined;
  now?: Date | undefined;
}

export type AccessDecision =
  | { allowed: true; context: MachineAuthContext; record: ApiKeyRecord }
  | { allowed: false; code: DenialCode; status: 401 | 403 | 429 };
