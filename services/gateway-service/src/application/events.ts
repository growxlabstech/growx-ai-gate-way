import type { ProviderUsage } from "@growx/contracts";

export interface GatewayRequestStartedEvent {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
  requestedModel: string;
  canonicalModel: string;
  providerId: string;
  stream: boolean;
}

export interface GatewayRequestCompletedEvent {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
  canonicalModel: string;
  providerId: string;
  usage: ProviderUsage;
  latencyMs: number;
}

export interface GatewayRequestFailedEvent {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
  canonicalModel?: string | undefined;
  errorCode: string;
  latencyMs: number;
}

export interface GatewayRequestCancelledEvent {
  requestId: string;
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
  canonicalModel?: string | undefined;
  latencyMs: number;
}

export interface GatewayAttemptEvent {
  requestId: string;
  attemptNumber: number;
  routeId: string;
  providerId: string;
  providerModelId: string;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  latencyMs?: number | null | undefined;
  errorCode?: string | null | undefined;
  fallbackReason?: string | null | undefined;
}

export interface IGatewayEvents {
  emitRequestStarted(event: GatewayRequestStartedEvent): Promise<void>;
  emitRequestCompleted(event: GatewayRequestCompletedEvent): Promise<void>;
  emitRequestFailed(event: GatewayRequestFailedEvent): Promise<void>;
  emitRequestCancelled(event: GatewayRequestCancelledEvent): Promise<void>;

  emitAttemptStarted(event: GatewayAttemptEvent): Promise<void>;
  emitAttemptSucceeded(event: GatewayAttemptEvent): Promise<void>;
  emitAttemptFailed(event: GatewayAttemptEvent): Promise<void>;
  emitFallbackSelected(event: {
    requestId: string;
    fromProviderId: string;
    toProviderId: string;
    fromRouteId?: string | undefined;
    toRouteId?: string | undefined;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void>;
  emitRetryScheduled(event: {
    requestId: string;
    attemptNumber: number;
    delayMs: number;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void>;
  emitRetryExhausted(event: {
    requestId: string;
    totalAttempts: number;
    lastError: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void>;

  emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void>;
}
