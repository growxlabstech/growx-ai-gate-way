import { z } from "zod";
import {
  canonicalCapabilitySchema,
  providerCredentialStatusSchema,
  type ProviderCredentialStatus,
} from "./ai.js";

// ============================================================================
// Enums
// ============================================================================

export const providerAccountTypeSchema = z.enum([
  "standard",
  "enterprise",
  "dedicated",
  "regional",
  "batch",
  "experimental",
]);
export type ProviderAccountType = z.infer<typeof providerAccountTypeSchema>;

export const providerAccountStatusSchema = z.enum([
  "active",
  "degraded",
  "draining",
  "disabled",
  "suspended",
]);
export type ProviderAccountStatus = z.infer<typeof providerAccountStatusSchema>;

export const providerCredentialTypeSchema = z.enum([
  "api_key",
  "oauth_client",
  "service_account",
  "access_token",
  "signed_key",
]);
export type ProviderCredentialType = z.infer<
  typeof providerCredentialTypeSchema
>;

export { providerCredentialStatusSchema, type ProviderCredentialStatus };

export const credentialVersionStatusSchema = z.enum([
  "pending",
  "valid",
  "active",
  "draining",
  "retired",
  "revoked",
  "invalid",
]);
export type CredentialVersionStatus = z.infer<
  typeof credentialVersionStatusSchema
>;

export const credentialValidationStatusSchema = z.enum([
  "unknown",
  "valid",
  "invalid",
  "skipped",
]);
export type CredentialValidationStatus = z.infer<
  typeof credentialValidationStatusSchema
>;

export const providerPoolStatusSchema = z.enum([
  "active",
  "draining",
  "disabled",
]);
export type ProviderPoolStatus = z.infer<typeof providerPoolStatusSchema>;

export const providerPoolStrategySchema = z.enum([
  "weighted",
  "least_loaded",
  "priority",
  "capacity_aware",
]);
export type ProviderPoolStrategy = z.infer<typeof providerPoolStrategySchema>;

export const providerAccountLimitTypeSchema = z.enum([
  "requests_per_minute",
  "tokens_per_minute",
  "requests_per_day",
  "tokens_per_day",
  "concurrency",
  "batch_concurrency",
  "provider_specific",
]);
export type ProviderAccountLimitType = z.infer<
  typeof providerAccountLimitTypeSchema
>;

export const providerAccountLimitSourceSchema = z.enum([
  "configured",
  "provider_reported",
  "observed",
  "contract",
]);
export type ProviderAccountLimitSource = z.infer<
  typeof providerAccountLimitSourceSchema
>;

// ============================================================================
// Domain Entities & DTOs
// ============================================================================

export const providerAccountSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  displayName: z.string(),
  externalAccountReference: z.string().optional(),
  accountType: providerAccountTypeSchema.default("standard"),
  status: providerAccountStatusSchema.default("active"),
  environment: z.string().default("production"),
  region: z.string().optional(),
  residency: z.string().optional(),
  priority: z.number().int().default(100),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  disabledAt: z.coerce.date().optional(),
  drainingAt: z.coerce.date().optional(),
});
export type ProviderAccount = z.infer<typeof providerAccountSchema>;

export const providerCredentialSchema = z.object({
  id: z.string(),
  providerAccountId: z.string(),
  providerId: z.string().optional(),
  name: z.string().default("default"),
  credentialType: providerCredentialTypeSchema.default("api_key"),
  status: providerCredentialStatusSchema.default("active"),
  activeVersionId: z.string().optional(),
  environment: z.string().default("production"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  rotatedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

export const providerCredentialVersionSchema = z.object({
  id: z.string(),
  credentialId: z.string(),
  version: z.number().int().positive(),
  secretReference: z.string(),
  keyFingerprint: z.string(),
  status: credentialVersionStatusSchema.default("pending"),
  validationStatus: credentialValidationStatusSchema.default("unknown"),
  validatedAt: z.coerce.date().optional(),
  activatedAt: z.coerce.date().optional(),
  retiredAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
export type ProviderCredentialVersion = z.infer<
  typeof providerCredentialVersionSchema
>;

export const credentialValidationSchema = z.object({
  id: z.string(),
  credentialVersionId: z.string(),
  status: credentialValidationStatusSchema,
  latencyMs: z.number().int().nonnegative().optional(),
  safeErrorCode: z.string().optional(),
  details: z.record(z.string(), z.unknown()).default({}),
  checkedAt: z.coerce.date(),
});
export type CredentialValidation = z.infer<typeof credentialValidationSchema>;

export const providerCredentialPoolMemberSchema = z.object({
  id: z.string(),
  poolId: z.string(),
  providerAccountId: z.string(),
  credentialId: z.string(),
  weight: z.number().int().min(1).max(1000).default(100),
  priority: z.number().int().min(1).max(1000).default(100),
  maxConcurrency: z.number().int().positive().optional(),
  status: providerPoolStatusSchema.default("active"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProviderCredentialPoolMember = z.infer<
  typeof providerCredentialPoolMemberSchema
>;

export const providerCredentialPoolSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  environment: z.string().default("production"),
  region: z.string().optional(),
  workloadType: z.string().optional(),
  status: providerPoolStatusSchema.default("active"),
  strategy: providerPoolStrategySchema.default("capacity_aware"),
  members: z.array(providerCredentialPoolMemberSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProviderCredentialPool = z.infer<
  typeof providerCredentialPoolSchema
>;

export const providerAccountCapabilitySchema = z.object({
  id: z.string(),
  providerAccountId: z.string(),
  canonicalModelId: z.string().optional(),
  providerModelId: z.string().optional(),
  capability: canonicalCapabilitySchema,
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProviderAccountCapability = z.infer<
  typeof providerAccountCapabilitySchema
>;

export const providerAccountLimitSchema = z.object({
  id: z.string(),
  providerAccountId: z.string(),
  canonicalModelId: z.string().optional(),
  limitType: providerAccountLimitTypeSchema,
  limitValue: z.number().int().positive(),
  windowSeconds: z.number().int().positive().optional(),
  source: providerAccountLimitSourceSchema.default("configured"),
  effectiveAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProviderAccountLimit = z.infer<typeof providerAccountLimitSchema>;

// ============================================================================
// Execution Target & Resolved Credential Boundaries
// ============================================================================

export const executionTargetSchema = z.object({
  routeId: z.string(),
  providerId: z.string(),
  providerAccountId: z.string(),
  credentialId: z.string(),
  credentialVersionId: z.string().optional(),
  region: z.string().default("global"),
  capacityClass: z.string().optional(),
  poolId: z.string().optional(),
});
export type ExecutionTarget = z.infer<typeof executionTargetSchema>;

export interface ResolvedProviderCredential {
  providerId: string;
  accountId: string;
  credentialId: string;
  credentialVersionId: string;
  credentialType: ProviderCredentialType;
  secret: string;
  version: number;
}

// ============================================================================
// Admin Request DTOs
// ============================================================================

export const createProviderAccountRequestSchema = z.object({
  displayName: z.string().min(1).max(100),
  externalAccountReference: z.string().max(100).optional(),
  accountType: providerAccountTypeSchema.default("standard"),
  environment: z.string().default("production"),
  region: z.string().optional(),
  residency: z.string().optional(),
  priority: z.number().int().default(100),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateProviderAccountRequest = z.infer<
  typeof createProviderAccountRequestSchema
>;

export const updateProviderAccountRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  externalAccountReference: z.string().max(100).optional(),
  accountType: providerAccountTypeSchema.optional(),
  status: providerAccountStatusSchema.optional(),
  region: z.string().optional(),
  residency: z.string().optional(),
  priority: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateProviderAccountRequest = z.infer<
  typeof updateProviderAccountRequestSchema
>;

export const createProviderCredentialRequestV2Schema = z.object({
  name: z.string().min(1).max(100).default("default"),
  credentialType: providerCredentialTypeSchema.default("api_key"),
  rawSecret: z.string().min(1),
  environment: z.string().default("production"),
  expiresAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  autoActivate: z.boolean().default(true),
  validateBeforeActivation: z.boolean().default(true),
});
export type CreateProviderCredentialRequestV2 = z.infer<
  typeof createProviderCredentialRequestV2Schema
>;

export const createProviderCredentialVersionRequestSchema = z.object({
  rawSecret: z.string().min(1),
  expiresAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  autoActivate: z.boolean().default(false),
  validateBeforeActivation: z.boolean().default(true),
});
export type CreateProviderCredentialVersionRequest = z.infer<
  typeof createProviderCredentialVersionRequestSchema
>;

export const rotateProviderCredentialRequestV2Schema = z.object({
  newRawSecret: z.string().min(1),
  reason: z.string().min(1).default("Scheduled rotation"),
  expiresAt: z.coerce.date().optional(),
  validateBeforeActivation: z.boolean().default(true),
});
export type RotateProviderCredentialRequestV2 = z.infer<
  typeof rotateProviderCredentialRequestV2Schema
>;

export const createProviderPoolRequestSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1).max(100),
  environment: z.string().default("production"),
  region: z.string().optional(),
  workloadType: z.string().optional(),
  strategy: providerPoolStrategySchema.default("capacity_aware"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateProviderPoolRequest = z.infer<
  typeof createProviderPoolRequestSchema
>;

export const addPoolMemberRequestSchema = z.object({
  providerAccountId: z.string().min(1),
  credentialId: z.string().min(1),
  weight: z.number().int().min(1).max(1000).default(100),
  priority: z.number().int().min(1).max(1000).default(100),
  maxConcurrency: z.number().int().positive().optional(),
});
export type AddPoolMemberRequest = z.infer<typeof addPoolMemberRequestSchema>;

export const setAccountCapabilityRequestSchema = z.object({
  canonicalModelId: z.string().optional(),
  providerModelId: z.string().optional(),
  capability: canonicalCapabilitySchema,
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SetAccountCapabilityRequest = z.infer<
  typeof setAccountCapabilityRequestSchema
>;

export const setAccountLimitRequestSchema = z.object({
  canonicalModelId: z.string().optional(),
  limitType: providerAccountLimitTypeSchema,
  limitValue: z.number().int().positive(),
  windowSeconds: z.number().int().positive().optional(),
  source: providerAccountLimitSourceSchema.default("configured"),
  effectiveAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type SetAccountLimitRequest = z.infer<
  typeof setAccountLimitRequestSchema
>;
