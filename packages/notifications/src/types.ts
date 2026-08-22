export type NotificationCategory =
  | "authentication"
  | "security"
  | "account"
  | "developer"
  | "usage"
  | "billing"
  | "payments"
  | "invoices"
  | "webhooks"
  | "operations";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationChannel = "email" | "in_app";

export type PreferenceMode = "mandatory" | "organization_default" | "optional";

export interface NotificationIntent {
  id: string;
  sourceEventId: string;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  category: NotificationCategory;
  type: string; // e.g. "auth.otp", "credit.low", "security.alert"
  priority: NotificationPriority;
  preferenceMode: PreferenceMode;
  templateKey: string;
  templateVersion: number;
  data: Record<string, unknown>;
  createdAt: Date;
  expiresAt?: Date | undefined;
}

export interface NotificationRecipient {
  userId?: string | undefined;
  email?: string | undefined;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  role?: string | undefined;
  locale?: string | undefined;
  timezone?: string | undefined;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "rendering"
  | "queued"
  | "sending"
  | "delivered"
  | "retrying"
  | "failed"
  | "suppressed"
  | "cancelled"
  | "expired";

export interface NotificationDelivery {
  id: string;
  intentId: string;
  recipientId?: string | undefined;
  recipientSnapshot: string; // email address or userId
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  priority: NotificationPriority;
  templateKey: string;
  templateVersion: number;
  provider?: string | undefined; // "resend" | "in_app" | "dev"
  providerMessageId?: string | undefined;
  scheduledAt: Date;
  firstAttemptAt?: Date | undefined;
  completedAt?: Date | undefined;
  failedAt?: Date | undefined;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: Date | undefined;
  leaseOwner?: string | undefined;
  leaseExpiresAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  provider: string;
  startedAt: Date;
  completedAt?: Date | undefined;
  providerStatus?: string | undefined;
  providerMessageId?: string | undefined;
  errorCategory?: string | undefined;
  retryable: boolean;
  latencyMs?: number | undefined;
}

export interface InAppNotification {
  id: string;
  userId: string;
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | undefined;
  priority: NotificationPriority;
  readAt?: Date | undefined;
  createdAt: Date;
  expiresAt?: Date | undefined;
}

export type SuppressionReason =
  "hard_bounce" | "complaint" | "manual" | "invalid_address";

export interface NotificationSuppression {
  id: string;
  destination: string; // email address or normalized hash
  reason: SuppressionReason;
  source: string;
  createdAt: Date;
  expiresAt?: Date | undefined;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  organizationId?: string | undefined;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  updatedAt: Date;
}

export interface OrganizationNotificationSettings {
  organizationId: string;
  securityAlertsEnabled: boolean;
  billingAlertsEnabled: boolean;
  usageAlertsEnabled: boolean;
  defaultTimezone?: string | undefined;
  updatedAt: Date;
}

export interface NotificationEscalationPolicy {
  type: string;
  severity: "high" | "critical";
  initialChannels: readonly NotificationChannel[];
  escalationDelayMs: number;
  escalationChannels: readonly NotificationChannel[];
  maxEscalations: number;
}

export interface NotificationEscalationState {
  id: string;
  intentId: string;
  signalId?: string | undefined;
  organizationId?: string | undefined;
  escalationCount: number;
  maxEscalations: number;
  nextEscalationAt: Date;
  status: "pending" | "escalated" | "cancelled" | "completed";
  createdAt: Date;
  updatedAt: Date;
}
