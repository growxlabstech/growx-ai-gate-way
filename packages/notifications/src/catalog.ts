import type {
  NotificationCategory,
  NotificationChannel,
  NotificationEscalationPolicy,
  NotificationPriority,
  PreferenceMode,
} from "./types.js";

export interface NotificationPolicyDefinition {
  type: string;
  category: NotificationCategory;
  defaultChannels: readonly NotificationChannel[];
  priority: NotificationPriority;
  preferenceMode: PreferenceMode;
  templateKey: string;
  deduplicationWindowSeconds?: number | undefined;
  escalationPolicy?: NotificationEscalationPolicy | undefined;
  expiresInSeconds?: number | undefined;
  customerVisible: boolean;
  version: number;
}

export const NOTIFICATION_POLICY_CATALOG: readonly NotificationPolicyDefinition[] = [
  // ─── Authentication ──────────────────────────────────────────
  {
    type: "auth.otp",
    category: "authentication",
    defaultChannels: ["email"],
    priority: "high",
    preferenceMode: "mandatory",
    templateKey: "auth.otp",
    expiresInSeconds: 600, // 10 minutes
    customerVisible: true,
    version: 1,
  },

  // ─── Security ────────────────────────────────────────────────
  {
    type: "security.alert",
    category: "security",
    defaultChannels: ["email", "in_app"],
    priority: "critical",
    preferenceMode: "mandatory",
    templateKey: "security.alert",
    escalationPolicy: {
      type: "security.alert",
      severity: "critical",
      initialChannels: ["email", "in_app"],
      escalationDelayMs: 15 * 60 * 1000, // 15 mins
      escalationChannels: ["email", "in_app"],
      maxEscalations: 1,
    },
    customerVisible: true,
    version: 1,
  },
  {
    type: "api_key.revoked",
    category: "security",
    defaultChannels: ["email", "in_app"],
    priority: "high",
    preferenceMode: "mandatory",
    templateKey: "api_key.revoked",
    customerVisible: true,
    version: 1,
  },

  // ─── Developer ───────────────────────────────────────────────
  {
    type: "api_key.expiring",
    category: "developer",
    defaultChannels: ["email", "in_app"],
    priority: "normal",
    preferenceMode: "organization_default",
    templateKey: "api_key.expiring",
    customerVisible: true,
    version: 1,
  },

  // ─── Billing & Credits ───────────────────────────────────────
  {
    type: "credit.low",
    category: "billing",
    defaultChannels: ["email", "in_app"],
    priority: "normal",
    preferenceMode: "organization_default",
    templateKey: "credit.low",
    deduplicationWindowSeconds: 24 * 60 * 60, // 24 hours cooldown
    customerVisible: true,
    version: 1,
  },
  {
    type: "credit.exhausted",
    category: "billing",
    defaultChannels: ["email", "in_app"],
    priority: "high",
    preferenceMode: "mandatory",
    templateKey: "credit.exhausted",
    customerVisible: true,
    version: 1,
  },
  {
    type: "subscription.updated",
    category: "billing",
    defaultChannels: ["email", "in_app"],
    priority: "normal",
    preferenceMode: "optional",
    templateKey: "subscription.updated",
    customerVisible: true,
    version: 1,
  },
  {
    type: "subscription.renewal_upcoming",
    category: "billing",
    defaultChannels: ["email"],
    priority: "normal",
    preferenceMode: "optional",
    templateKey: "subscription.renewal_upcoming",
    customerVisible: true,
    version: 1,
  },

  // ─── Payments ────────────────────────────────────────────────
  {
    type: "payment.succeeded",
    category: "payments",
    defaultChannels: ["email"],
    priority: "normal",
    preferenceMode: "optional",
    templateKey: "payment.succeeded",
    customerVisible: true,
    version: 1,
  },
  {
    type: "payment.failed",
    category: "payments",
    defaultChannels: ["email", "in_app"],
    priority: "high",
    preferenceMode: "mandatory",
    templateKey: "payment.failed",
    customerVisible: true,
    version: 1,
  },

  // ─── Invoices ────────────────────────────────────────────────
  {
    type: "invoice.issued",
    category: "invoices",
    defaultChannels: ["email"],
    priority: "normal",
    preferenceMode: "optional",
    templateKey: "invoice.issued",
    customerVisible: true,
    version: 1,
  },

  // ─── Webhooks ────────────────────────────────────────────────
  {
    type: "webhook.endpoint_failing",
    category: "webhooks",
    defaultChannels: ["email", "in_app"],
    priority: "high",
    preferenceMode: "organization_default",
    templateKey: "webhook.endpoint_failing",
    deduplicationWindowSeconds: 6 * 60 * 60, // 6 hours cooldown
    customerVisible: true,
    version: 1,
  },
];

export function getNotificationPolicy(type: string): NotificationPolicyDefinition | undefined {
  return NOTIFICATION_POLICY_CATALOG.find((p) => p.type === type);
}
