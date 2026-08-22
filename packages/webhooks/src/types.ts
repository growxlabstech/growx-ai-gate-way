export type WebhookEndpointStatus =
  "active" | "disabled" | "failing" | "blocked";

export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  workspaceId?: string | undefined;
  url: string;
  description: string;
  status: WebhookEndpointStatus;
  secretId: string;
  secretEncrypted: string;
  secretVersion: number;
  eventTypes: readonly string[];
  consecutiveFailures: number;
  lastSuccessAt?: Date | undefined;
  lastFailureAt?: Date | undefined;
  disabledAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookSecretStatus = "active" | "rotated" | "revoked";

export interface WebhookSigningSecret {
  id: string;
  endpointId: string;
  encryptedSecret: string;
  keyVersion: number;
  status: WebhookSecretStatus;
  createdAt: Date;
  expiresAt?: Date | undefined;
}

export interface WebhookSubscription {
  id: string;
  endpointId: string;
  eventType: string; // e.g. "payment.succeeded.v1" or "payment.*"
  filterConfig?: Record<string, unknown> | undefined;
  createdAt: Date;
}

export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string;
  type: string;
  version: string;
  createdAt: string;
  organizationId: string;
  workspaceId?: string | undefined;
  data: T;
  livemode?: boolean | undefined;
}

export interface OutboundWebhookEvent {
  id: string;
  organizationId: string;
  workspaceId?: string | undefined;
  eventType: string;
  eventVersion: string;
  sourceEventId: string;
  payload: WebhookEnvelope;
  payloadHash: string;
  createdAt: Date;
}

export type WebhookDeliveryStatus =
  | "pending"
  | "delivering"
  | "succeeded"
  | "retrying"
  | "failed"
  | "dead_letter"
  | "cancelled";

export type WebhookErrorCategory =
  | "NETWORK_ERROR"
  | "DNS_RESOLUTION_FAILED"
  | "SSRF_BLOCKED"
  | "TIMEOUT"
  | "HTTP_4XX_CLIENT_ERROR"
  | "HTTP_429_RATE_LIMITED"
  | "HTTP_5XX_SERVER_ERROR"
  | "REDIRECT_DISALLOWED"
  | "UNKNOWN";

export interface WebhookDelivery {
  id: string;
  webhookEventId: string;
  endpointId: string;
  organizationId: string;
  workspaceId?: string | undefined;
  destinationUrlSnapshot: string;
  signingSecretVersion: number;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: Date | undefined;
  leaseExpiresAt?: Date | undefined;
  claimedBy?: string | undefined;
  lastResponseCode?: number | undefined;
  lastErrorCategory?: WebhookErrorCategory | undefined;
  deliveredAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  startedAt: Date;
  completedAt: Date;
  responseStatus?: number | undefined;
  latencyMs?: number | undefined;
  errorCategory?: WebhookErrorCategory | undefined;
  responseBodySnippet?: string | undefined;
}

export type ReplayJobStatus = "pending" | "processing" | "completed" | "failed";

export interface WebhookReplayJob {
  id: string;
  organizationId: string;
  filterConfig: {
    eventTypes?: string[] | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
    endpointId?: string | undefined;
  };
  status: ReplayJobStatus;
  totalEvents: number;
  replayedEvents: number;
  createdAt: Date;
  completedAt?: Date | undefined;
}

export interface WebhookRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  maxRetryAfterSeconds: number;
}

export const DEFAULT_WEBHOOK_RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 3_600_000, // 1 hour cap
  jitter: true,
  maxRetryAfterSeconds: 3_600,
};

export interface WebhookEventTypeMetadata {
  key: string;
  version: string;
  category:
    | "gateway"
    | "auth"
    | "usage"
    | "subscription"
    | "payment"
    | "billing"
    | "test";
  description: string;
  customerVisible: boolean;
  deprecatedAt?: string | undefined;
}
