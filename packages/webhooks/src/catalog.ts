import type { WebhookEventTypeMetadata } from "./types.js";

export const WEBHOOK_EVENT_CATALOG: readonly WebhookEventTypeMetadata[] = [
  // Gateway requests
  {
    key: "request.completed",
    version: "v1",
    category: "gateway",
    description: "Emitted when a customer AI gateway completion request finishes successfully",
    customerVisible: true,
  },
  {
    key: "request.failed",
    version: "v1",
    category: "gateway",
    description: "Emitted when a customer AI gateway completion request fails",
    customerVisible: true,
  },

  // API Keys
  {
    key: "api_key.created",
    version: "v1",
    category: "auth",
    description: "Emitted when a new customer API key is generated",
    customerVisible: true,
  },
  {
    key: "api_key.revoked",
    version: "v1",
    category: "auth",
    description: "Emitted when an active customer API key is revoked",
    customerVisible: true,
  },

  // Subscriptions & Plans
  {
    key: "subscription.created",
    version: "v1",
    category: "subscription",
    description: "Emitted when an organization subscribes to a new plan tier",
    customerVisible: true,
  },
  {
    key: "subscription.updated",
    version: "v1",
    category: "subscription",
    description: "Emitted when an organization subscription is modified or upgraded",
    customerVisible: true,
  },
  {
    key: "subscription.cancelled",
    version: "v1",
    category: "subscription",
    description: "Emitted when an organization subscription is cancelled or scheduled to cancel",
    customerVisible: true,
  },
  {
    key: "subscription.renewed",
    version: "v1",
    category: "subscription",
    description: "Emitted when a subscription successfully enters a new billing period",
    customerVisible: true,
  },
  {
    key: "subscription.past_due",
    version: "v1",
    category: "subscription",
    description: "Emitted when a subscription payment renewal fails",
    customerVisible: true,
  },

  // Payments
  {
    key: "payment.succeeded",
    version: "v1",
    category: "payment",
    description: "Emitted when a payment transaction settles successfully",
    customerVisible: true,
  },
  {
    key: "payment.failed",
    version: "v1",
    category: "payment",
    description: "Emitted when a payment transaction fails or is declined",
    customerVisible: true,
  },
  {
    key: "payment.refunded",
    version: "v1",
    category: "payment",
    description: "Emitted when a payment is partially or fully refunded",
    customerVisible: true,
  },

  // Invoices & Billing
  {
    key: "invoice.issued",
    version: "v1",
    category: "billing",
    description: "Emitted when a commercial invoice is legally issued with final tax calculation",
    customerVisible: true,
  },
  {
    key: "invoice.paid",
    version: "v1",
    category: "billing",
    description: "Emitted when an invoice is fully settled with payment allocations",
    customerVisible: true,
  },
  {
    key: "invoice.voided",
    version: "v1",
    category: "billing",
    description: "Emitted when an invoice is legally voided",
    customerVisible: true,
  },
  {
    key: "credit_note.issued",
    version: "v1",
    category: "billing",
    description: "Emitted when a credit note is issued against an existing invoice",
    customerVisible: true,
  },

  // Credits & Wallet
  {
    key: "credit.low",
    version: "v1",
    category: "usage",
    description: "Emitted when an organization credit balance drops below configured threshold",
    customerVisible: true,
  },
  {
    key: "credit.granted",
    version: "v1",
    category: "usage",
    description: "Emitted when new prepaid or recurring credits are granted to an organization wallet",
    customerVisible: true,
  },
  {
    key: "credit.expired",
    version: "v1",
    category: "usage",
    description: "Emitted when promotional or periodic credits reach expiration",
    customerVisible: true,
  },

  // Test Webhook
  {
    key: "test.ping",
    version: "v1",
    category: "test",
    description: "Synthetic test event triggered by the customer to verify endpoint connectivity",
    customerVisible: true,
  },
];

export function formatEventTypeName(key: string, version: string = "v1"): string {
  return `${key}.${version}`;
}

export function isSupportedEventType(typeWithVersion: string): boolean {
  return WEBHOOK_EVENT_CATALOG.some(
    (meta) => formatEventTypeName(meta.key, meta.version) === typeWithVersion
  );
}

export function matchesEventSubscription(
  subscribedPattern: string,
  eventTypeName: string
): boolean {
  if (subscribedPattern === "*" || subscribedPattern === "*.*" || subscribedPattern === eventTypeName) {
    return true;
  }

  // Prefix wildcard, e.g. "payment.*" matches "payment.succeeded.v1" or "payment.failed.v1"
  if (subscribedPattern.endsWith(".*")) {
    const prefix = subscribedPattern.slice(0, -2);
    return eventTypeName.startsWith(`${prefix}.`);
  }

  return false;
}
