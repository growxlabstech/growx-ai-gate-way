import type {
  CanonicalCapability,
  FinishReason,
  ModelCategory,
  ProviderErrorCode,
  UsageSource,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";
import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ProviderRouteEntity,
} from "@growx/model-registry-service";

export type GatewayRequestStatus =
  | "received"
  | "authenticated"
  | "executing"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface GatewayRequestEntity {
  id: string;
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  apiKeyId: string;
  requestedModel: string;
  resolvedModel: string | null;
  status: GatewayRequestStatus;
  stream: boolean;
  providerId: string | null;
  providerModelId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  latencyMs: number | null;
  errorCode: string | null;
  finishReason: FinishReason | null;
  cachedResponseUsed?: boolean | undefined;
  createdAt: Date;
}

export interface GatewayUsageSnapshot {
  id: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  source: UsageSource;
  createdAt: Date;
}

export interface GatewayLatencyRecord {
  requestId: string;
  gatewayOverheadMs: number;
  providerLatencyMs: number;
  timeToFirstTokenMs?: number | undefined;
  totalLatencyMs: number;
}

export interface GatewayErrorRecord {
  id: string;
  requestId: string;
  code: string;
  retryable: boolean;
  safeMessage: string;
  createdAt: Date;
}

export interface ResolvedGatewayRoute {
  canonicalModel: CanonicalModelEntity;
  route: ProviderRouteEntity;
  activeAlias?: ModelAliasEntity | undefined;
  requestedModelId: string;
  canonicalModelId: string;
  requiredCapabilities: CanonicalCapability[];
  routingDecision?: any | undefined;
}

export interface GatewayExecutionOptions {
  requestId?: string | undefined;
  cancellationSignal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  clientIp?: string | undefined;
  idempotencyKey?: string | undefined;
}

/** Extended options for streaming requests. */
export interface StreamExecutionOptions extends GatewayExecutionOptions {
  /** Maximum total stream duration in ms (default: 300_000 = 5 min) */
  deadlineMs?: number | undefined;
  /** Max ms between provider chunks before idle timeout (default: 60_000 = 1 min) */
  idleTimeoutMs?: number | undefined;
  /** Interval in ms for SSE heartbeat comments (default: 30_000 = 30s) */
  heartbeatIntervalMs?: number | undefined;
  /** Whether to include usage data in the final stream chunk (stream_options.include_usage) */
  includeUsage?: boolean | undefined;
}

export interface ExecutionContext {
  requestId: string;
  auth: MachineAuthContext;
  requestedModel: string;
  startedAt: Date;
  options: GatewayExecutionOptions;
}

export * from "@growx/routing";

