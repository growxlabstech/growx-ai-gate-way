import { z } from "zod";
export * from "./ai.js";
export * from "./files.js";
export * from "./batches.js";
export * from "./routing.js";
export * from "./provider-vault.js";

export const identifierSchema = z.string().regex(/^[a-z]+_[a-f0-9]{32}$/);
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const emailSchema = z
  .email()
  .transform((value) => value.trim().toLowerCase());
export const userStatusSchema = z.enum([
  "active",
  "invited",
  "suspended",
  "disabled",
  "deleted",
]);
export const organizationStatusSchema = z.enum([
  "active",
  "trial",
  "restricted",
  "suspended",
  "archived",
]);
export const membershipStatusSchema = z.enum([
  "invited",
  "active",
  "suspended",
  "removed",
]);
export const workspaceStatusSchema = z.enum([
  "active",
  "restricted",
  "suspended",
  "archived",
]);
export const environmentTypeSchema = z.enum([
  "development",
  "staging",
  "production",
  "custom",
]);

export const registerRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: z.string().min(12).max(128),
  locale: z.string().default("en"),
  timezone: z.string().default("UTC"),
});
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  workspaceName: z.string().trim().min(2).max(100),
  workspaceSlug: slugSchema,
  billingEmail: emailSchema.optional(),
  country: z.string().length(2).optional(),
  defaultCurrency: z.string().length(3).default("USD"),
  timezone: z.string().default("UTC"),
});
export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  description: z.string().max(500).optional(),
  region: z.string().min(2).max(32).default("auto"),
});
export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  type: environmentTypeSchema,
});
export const invitationSchema = z.object({
  email: emailSchema,
  roleId: identifierSchema,
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

export const permissions = [
  "organization.read",
  "organization.update",
  "organization.archive",
  "organization.transferOwnership",
  "member.read",
  "member.invite",
  "member.update",
  "member.remove",
  "team.create",
  "team.update",
  "team.delete",
  "billing.read",
  "billing.manage",
  "audit.read",
  "workspace.read",
  "workspace.create",
  "workspace.update",
  "workspace.archive",
  "workspace.member.read",
  "workspace.member.manage",
  "environment.create",
  "environment.update",
  "environment.delete",
  "apiKey.read",
  "apiKey.create",
  "apiKey.update",
  "apiKey.revoke",
  "apiKey.rotate",
  "apiKey.emergencyRevoke",
  "model.read",
  "provider.read",
  "usage.read",
  "logs.read",
  "settings.manage",
  "routing.read",
  "routing.manage",
  "routing.policy.create",
  "routing.policy.activate",
  "provider.health.read",
  "provider.manage",
  "provider.circuit.manage",
  "provider.capacity.manage",
  "cache.manage",
  "pricing.read",
  "pricing.manage",
  "credits.read",
  "credits.adjust",
  "payments.read",
  "payments.refund",
  "invoices.read",
  "invoices.manage",
  "ledger.read",
  "reconciliation.read",
  "reconciliation.manage",
  "webhook.read",
  "webhook.manage",
  "notification.read",
  "notification.manage",
  "serviceAccount.read",
  "serviceAccount.manage",
  "export.create",
  "export.read",
  "incident.read",
  "logs.replay",
  "ops.models.read",
  "ops.models.write",
  "ops.models.deprecate",
  "ops.models.retire",
  "ops.routes.manage",
  "ops.aliases.manage",
  "ops.pricing.manage",
  "ops.capacity.manage",
  "ops.quota.manage",
  "quota.read",
  "quota.manage",
  "ops.providers.read",
  "ops.providers.write",
  "ops.providers.disable",
  "ops.providers.credentials.manage",
  "ops.providers.credentials.read",
  "ops.policy.manage",
  "organization.policies.read",
  "organization.policies.manage",
  "workspace.policies.read",
  "workspace.policies.manage",
  "policy.read",
  "policy.manage",
  "ops.usage.read",
  "ops.usage.correct",
  "usage.manage",
  "analytics.read",
  "ops.analytics.read",
  "files.read",
  "files.create",
  "files.delete",
  "files.manage",
  "ops.files.read",
  "ops.files.manage",
  "batches.read",
  "batches.create",
  "batches.cancel",
  "batches.manage",
  "ops.batches.read",
  "ops.batches.manage",
  "tools.read",
  "tools.create",
  "tools.update",
  "tools.archive",
  "ops.tools.read",
  "ops.tools.manage",
  "ops.tools.execute_privileged",
] as const;
export const permissionSchema = z.enum(permissions);
export type Permission = z.infer<typeof permissionSchema>;
export const builtInRoleSchema = z.enum([
  "organization_owner",
  "organization_admin",
  "developer",
  "billing_manager",
  "viewer",
]);
export type BuiltInRole = z.infer<typeof builtInRoleSchema>;

export const eventTypes = [
  "identity.user.created",
  "identity.user.emailVerified",
  "identity.session.created",
  "identity.session.revoked",
  "organization.created",
  "organization.updated",
  "organization.member.invited",
  "organization.member.joined",
  "organization.member.removed",
  "organization.role.changed",
  "team.created",
  "team.member.added",
  "workspace.created",
  "workspace.updated",
  "workspace.archived",
  "environment.created",
  "environment.updated",
  "authorization.permission.denied",
  "api_key.created",
  "api_key.updated",
  "api_key.rotated",
  "api_key.revoked",
  "api_key.expired",
  "gateway.authentication.failed",
  "gateway.permission.denied",
  "gateway.rate_limit.exceeded",
  "gateway.budget.exceeded",
  "model.created",
  "model.updated",
  "model.disabled",
  "model.deprecated",
  "model.retired",
  "model.route.created",
  "model.route.updated",
  "model.route.disabled",
  "model.alias.created",
  "model.alias.updated",
  "model.alias.retired",
  "model.pricing.created",
  "model.pricing.updated",
  "provider.created",
  "provider.updated",
  "provider.disabled",
  "provider.enabled",
  "provider.credential.created",
  "provider.credential.rotated",
  "provider.credential.disabled",
  "security.privileged.unauthorized_model_access",
  "security.privileged.unauthorized_provider_access",
  "security.provider.decryption_failed",
  "security.provider.ssrf_blocked",
  "security.provider.invalid_credential_scope",
  "routing.policy.created",
  "routing.policy.updated",
  "routing.policy.activated",
  "routing.policy.retired",
  "routing.policy.disabled",
  "routing.global.updated",
  "routing.route.draining",
  "routing.traffic.changed",
  "routing.kill_switch.used",
  "provider.account.created",
  "provider.account.updated",
  "provider.account.disabled",
  "provider.account.draining",
  "provider.credential.created",
  "provider.credential.version_created",
  "provider.credential.validated",
  "provider.credential.activated",
  "provider.credential.rotated",
  "provider.credential.retired",
  "provider.credential.revoked",
  "provider.pool.created",
  "provider.pool.updated",
  "provider.pool.member_added",
  "provider.pool.member_removed",
  "security.routing.unauthorized_policy_mutation",
  "security.routing.forbidden_provider_override",
  "security.routing.region_bypass_attempt",
  "gateway.request.started",
  "gateway.request.completed",
  "gateway.attempt.started",
  "gateway.attempt.failed",
  "gateway.attempt.succeeded",
  "gateway.attempt.cancelled",
  "gateway.fallback.selected",
  "gateway.retry.scheduled",
  "gateway.retry.exhausted",
  "security.gateway.repeated_credential_failure",
  "security.gateway.retry_storm_prevented",
  "provider.health.changed",
  "provider.route.health.changed",
  "provider.circuit.opened",
  "provider.circuit.half_open",
  "provider.circuit.closed",
  "provider.credential.unhealthy",
  "security.gateway.credential_auth_failure",
  "security.gateway.unauthorized_circuit_override",
  "quota.limit.exceeded",
  "quota.concurrency.exceeded",
  "quota.provider.capacity.exhausted",
  "quota.policy.created",
  "quota.policy.updated",
  "quota.policy.disabled",
  "capacity.provider.updated",
  "capacity.exhausted",
  "security.quota.bypass_attempt",
  "policy.created",
  "policy.updated",
  "policy.activated",
  "policy.disabled",
  "policy.archived",
  "security.policy.bypass_attempt",
  "security.policy.violation",
  "usage.recorded.v1",
  "usage.adjusted.v1",
  "usage.reconciled.v1",
  "security.usage.tamper_attempt",
  "security.usage.tenant_mismatch",
  "billing.credit.reserved",
  "billing.credit.settled",
  "billing.credit.released",
  "billing.credit.adjusted",
  "billing.payment.succeeded",
  "billing.payment.failed",
  "billing.refund.created",
  "billing.invoice.finalized",
  "billing.invoice.paid",
  "billing.reconciliation.mismatch",
  "webhook.endpoint.created",
  "webhook.endpoint.updated",
  "webhook.endpoint.disabled",
  "webhook.delivery.succeeded",
  "webhook.delivery.failed",
  "webhook.delivery.dead_lettered",
  "notification.created",
  "notification.read",
  "service_account.created",
  "service_account.disabled",
  "export.requested",
  "export.completed",
  "export.failed",
  "incident.created",
  "incident.updated",
  "incident.resolved",
  "analytics.anomaly.detected",
  "analytics.rebuild.completed",
  "file.created.v1",
  "file.uploaded.v1",
  "file.ready.v1",
  "file.rejected.v1",
  "file.quarantined.v1",
  "file.deleted.v1",
  "file.expired.v1",
  "file.provider_transfer.completed.v1",
  "file.provider_transfer.failed.v1",
  "security.file.cross_tenant_access_attempt",
  "security.file.unauthorized_download_attempt",
  "batch.created.v1",
  "batch.validated.v1",
  "batch.queued.v1",
  "batch.started.v1",
  "batch.progress.v1",
  "batch.cancelling.v1",
  "batch.cancelled.v1",
  "batch.completed.v1",
  "batch.partially_completed.v1",
  "batch.failed.v1",
  "batch.expired.v1",
  "security.batch.cross_tenant_access_attempt",
  "security.batch.unauthorized_cancel_attempt",
  "security.batch.quota_bypass_attempt",
] as const;
export const eventEnvelopeSchema = z.object({
  id: identifierSchema,
  type: z.enum(eventTypes),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  organizationId: identifierSchema.nullable(),
  workspaceId: identifierSchema.nullable(),
  actor: z.object({
    type: z.enum(["user", "service", "apiKey", "admin", "system"]),
    id: z.string(),
  }),
  data: z.record(z.string(), z.unknown()),
  metadata: z.object({
    requestId: identifierSchema,
    traceId: identifierSchema,
  }),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const apiKeyScopeSchema = z.enum([
  "models.read",
  "responses.create",
  "chat.completions.create",
  "embeddings.create",
  "usage.read",
  "analytics.read",
  "files.read",
  "files.create",
  "files.delete",
  "batches.read",
  "batches.create",
  "batches.cancel",
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeyStatusSchema = z.enum([
  "active",
  "expired",
  "revoked",
  "disabled",
]);
export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;

export const policyEffectSchema = z.enum(["allow", "deny"]);
export type PolicyEffect = z.infer<typeof policyEffectSchema>;

export const modelRuleSchema = z.object({
  id: z.string().optional(),
  effect: policyEffectSchema,
  pattern: z.string().min(1).max(256),
  category: z.string().max(64).optional(),
  maximumCostMinor: z.number().int().min(0).optional(),
});
export type ModelRule = z.infer<typeof modelRuleSchema>;

export const limitWindowSchema = z.enum(["minute", "hour", "day"]);
export type LimitWindow = z.infer<typeof limitWindowSchema>;

export const apiKeyRateLimitSchema = z.object({
  id: z.string().optional(),
  window: limitWindowSchema,
  requestLimit: z.number().int().positive(),
});
export type ApiKeyRateLimit = z.infer<typeof apiKeyRateLimitSchema>;

export const budgetModeSchema = z.enum(["warn", "soft", "hard"]);
export type BudgetMode = z.infer<typeof budgetModeSchema>;

export const apiKeySpendingLimitSchema = z.object({
  mode: budgetModeSchema,
  perRequestMinor: z.number().int().min(0).optional(),
  dailyMinor: z.number().int().min(0).optional(),
  monthlyMinor: z.number().int().min(0).optional(),
  currency: z.string().length(3).default("USD"),
  policyVersion: z.number().int().default(1),
});
export type ApiKeySpendingLimit = z.infer<typeof apiKeySpendingLimitSchema>;

export const createApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    environment: environmentTypeSchema.default("development"),
    environmentId: z.string().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    permissions: z
      .array(apiKeyScopeSchema)
      .min(1)
      .default(["models.read", "responses.create"]),
    modelRules: z.array(modelRuleSchema).default([]),
    ipAllowlist: z.array(z.string().min(1).max(64)).default([]),
    rateLimits: z.array(apiKeyRateLimitSchema).optional(),
    spendingLimit: apiKeySpendingLimitSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const updateApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    permissions: z.array(apiKeyScopeSchema).min(1).optional(),
    modelRules: z.array(modelRuleSchema).optional(),
    ipAllowlist: z.array(z.string().min(1).max(64)).optional(),
    rateLimits: z.array(apiKeyRateLimitSchema).optional(),
    spendingLimit: apiKeySpendingLimitSchema.optional(),
  })
  .strict();
export type UpdateApiKeyRequest = z.infer<typeof updateApiKeyRequestSchema>;

export const rotateApiKeyRequestSchema = z
  .object({
    overlapMinutes: z.number().int().min(0).max(1440).default(0),
    reason: z.string().max(256).optional(),
  })
  .strict();
export type RotateApiKeyRequest = z.infer<typeof rotateApiKeyRequestSchema>;

export const apiKeyMetadataSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  environmentId: z.string(),
  environment: environmentTypeSchema,
  name: z.string(),
  prefix: z.string(),
  maskedKey: z.string(),
  status: apiKeyStatusSchema,
  permissions: z.array(apiKeyScopeSchema),
  modelRules: z.array(modelRuleSchema),
  ipAllowlist: z.array(z.string()),
  rateLimits: z.array(apiKeyRateLimitSchema).optional(),
  spendingLimit: apiKeySpendingLimitSchema.optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
});
export type ApiKeyMetadata = z.infer<typeof apiKeyMetadataSchema>;

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeyMetadataSchema,
  secret: z.string(),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const machineAuthContextSchema = z.object({
  actorType: z.literal("apiKey"),
  apiKeyId: z.string(),
  organizationId: z.string(),
  workspaceId: z.string(),
  environmentId: z.string(),
  environment: environmentTypeSchema,
  name: z.string(),
  permissions: z.array(apiKeyScopeSchema),
  modelRules: z.array(modelRuleSchema),
  ipAllowlist: z.array(z.string()),
  rateLimits: z.array(apiKeyRateLimitSchema),
  spendingLimit: apiKeySpendingLimitSchema.optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  expiresAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
});
export type MachineAuthContext = z.infer<typeof machineAuthContextSchema>;

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  timestamp: z.iso.datetime(),
});
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});
export const apiVersion = "v1" as const;

export * from "./prompt-registry.js";
export * from "./tool-calling.js";
export * from "./structured-output.js";
export * from "./embeddings.js";
export * from "./multimodal.js";
export * from "./provider-operations.js";
export * from "./governance.js";
export * from "./reliability.js";
export * from "./performance.js";
export * from "./runtime.js";
export * from "./deployment.js";
