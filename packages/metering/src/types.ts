import { z } from "zod";

export const usageTypeSchema = z.enum([
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cached_input_tokens",
  "reasoning_tokens",
  "image_input_units",
  "image_output_units",
  "audio_input_seconds",
  "audio_output_seconds",
  "video_seconds",
  "embedding_tokens",
  "search_calls",
  "tool_calls",
]);
export type UsageType = z.infer<typeof usageTypeSchema>;

export const usageUnitSchema = z.enum([
  "token",
  "request",
  "image",
  "second",
  "minute",
  "byte",
  "operation",
]);
export type UsageUnit = z.infer<typeof usageUnitSchema>;

export const usageSourceSchema = z.enum([
  "provider_reported",
  "provider_stream_reported",
  "estimated",
  "reconciled",
  "manual_correction",
  "unavailable",
]);
export type UsageSource = z.infer<typeof usageSourceSchema>;

export const usageConfidenceSchema = z.enum([
  "exact",
  "high",
  "estimated",
  "unknown",
]);
export type UsageConfidence = z.infer<typeof usageConfidenceSchema>;

export const workloadTypeSchema = z.enum([
  "customer",
  "health_probe",
  "internal",
  "evaluation",
]);
export type WorkloadType = z.infer<typeof workloadTypeSchema>;

export const gatewayRequestStatusSchema = z.enum([
  "accepted",
  "executing",
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "timed_out",
]);
export type GatewayRequestStatus = z.infer<typeof gatewayRequestStatusSchema>;

export const providerAttemptStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "rejected_before_call",
]);
export type ProviderAttemptStatus = z.infer<typeof providerAttemptStatusSchema>;

export const meteringQualitySchema = z.enum([
  "provider_reported",
  "estimated",
  "mixed",
  "incomplete",
]);
export type MeteringQuality = z.infer<typeof meteringQualitySchema>;

export const meteringStatusSchema = z.enum([
  "pending",
  "complete",
  "estimated",
  "reconciled",
  "incomplete",
]);
export type MeteringStatus = z.infer<typeof meteringStatusSchema>;

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number | undefined;
  reasoningTokens?: number | undefined;
}

export interface ProviderConsumptionSummary extends TokenUsageSummary {
  attemptCount: number;
  failedAttemptCount: number;
}

export interface GatewayRequestRecord {
  id: string;
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId: string;
  operation: string;
  streaming: boolean;
  status: GatewayRequestStatus;
  startedAt: Date;
  completedAt?: Date | undefined;
  durationMs?: number | undefined;
  ttftMs?: number | undefined;
  finalAttemptId?: string | undefined;
  attemptCount: number;
  retryCount: number;
  fallbackCount: number;
  policyVersionHash?: string | undefined;
  quotaPolicyVersion?: number | undefined;
  workloadType: WorkloadType;
  meteringStatus: MeteringStatus;
  meteringQuality: MeteringQuality;
  logicalUsage: TokenUsageSummary;
  providerConsumption: ProviderConsumptionSummary;
  errorCode?: string | undefined;
  requestMetadata?: Record<string, unknown> | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface GatewayAttemptRecord {
  id: string;
  requestId: string;
  attemptNumber: number;
  providerId: string;
  providerRouteId?: string | undefined;
  providerModelId: string;
  region?: string | undefined;
  status: ProviderAttemptStatus;
  retryReason?: string | undefined;
  fallbackReason?: string | undefined;
  startedAt: Date;
  firstByteAt?: Date | undefined;
  completedAt?: Date | undefined;
  durationMs?: number | undefined;
  ttftMs?: number | undefined;
  providerRequestId?: string | undefined;
  errorCategory?: string | undefined;
  errorCode?: string | undefined;
  usageSource: UsageSource;
  usage: TokenUsageSummary;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
}

export interface UsageEvent {
  id: string;
  eventId: string;
  requestId: string;
  attemptId?: string | undefined;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId: string;
  providerId?: string | undefined;
  providerRouteId?: string | undefined;
  usageType: UsageType;
  quantity: bigint;
  unit: UsageUnit;
  source: UsageSource;
  confidence: UsageConfidence;
  workloadType: WorkloadType;
  occurredAt: Date;
  ingestedAt: Date;
  idempotencyKey: string;
  reconciliationGroupId?: string | undefined;
  reversalOfId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface UsageAggregate {
  id: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerId?: string | undefined;
  bucket: "hourly" | "daily";
  bucketStart: Date;
  bucketEnd: Date;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  cachedInputTokens: bigint;
  reasoningTokens: bigint;
  requestCount: number;
  attemptCount: number;
  errorCount: number;
  updatedAt: Date;
}

export interface UsageReconciliationRecord {
  id: string;
  requestId: string;
  attemptId?: string | undefined;
  originalEventId?: string | undefined;
  adjustmentEventId: string;
  previousQuantity: bigint;
  newQuantity: bigint;
  differenceQuantity: bigint;
  usageType: UsageType;
  reason: string;
  operatorId: string;
  createdAt: Date;
}

export interface NormalizedProviderUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  imageUnits?: number | undefined;
  audioSeconds?: number | undefined;
  source: UsageSource;
  confidence?: UsageConfidence | undefined;
}
