export interface AuditActionMetadata {
  action: string;
  sourceService: string;
  resourceType: string;
  securityRelevant: boolean;
  customerVisible: boolean;
  retentionClass: "standard" | "security" | "financial" | "privileged";
  description: string;
}

export const AUDIT_ACTION_CATALOG: readonly AuditActionMetadata[] = [
  // ─── Authentication & Identity ───────────────────────────────
  {
    action: "auth.sign_in",
    sourceService: "auth-service",
    resourceType: "user",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "standard",
    description: "User authenticated successfully",
  },
  {
    action: "auth.sign_out",
    sourceService: "auth-service",
    resourceType: "user",
    securityRelevant: false,
    customerVisible: true,
    retentionClass: "standard",
    description: "User signed out and revoked active session",
  },
  {
    action: "auth.privileged_elevation",
    sourceService: "auth-service",
    resourceType: "privileged_session",
    securityRelevant: true,
    customerVisible: false,
    retentionClass: "privileged",
    description: "Workforce operator elevated to JIT privileged session",
  },

  // ─── API Keys ────────────────────────────────────────────────
  {
    action: "api_key.created",
    sourceService: "api-key-service",
    resourceType: "api_key",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "security",
    description: "Customer API key created",
  },
  {
    action: "api_key.revoked",
    sourceService: "api-key-service",
    resourceType: "api_key",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "security",
    description: "Customer API key revoked",
  },

  // ─── Policy & Governance ─────────────────────────────────────
  {
    action: "policy.created",
    sourceService: "policy-service",
    resourceType: "policy",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "security",
    description: "Workspace governance policy created",
  },
  {
    action: "policy.updated",
    sourceService: "policy-service",
    resourceType: "policy",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "security",
    description: "Workspace governance policy updated or activated",
  },

  // ─── Provider & Credentials ──────────────────────────────────
  {
    action: "provider.credential_rotated",
    sourceService: "provider-service",
    resourceType: "provider_credential",
    securityRelevant: true,
    customerVisible: false,
    retentionClass: "privileged",
    description: "Upstream provider API key or credential rotated",
  },

  // ─── Wallet & Credits ────────────────────────────────────────
  {
    action: "wallet.adjustment_applied",
    sourceService: "credit-service",
    resourceType: "wallet",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "financial",
    description: "Manual or automated wallet balance adjustment",
  },
  {
    action: "wallet.credits_granted",
    sourceService: "credit-service",
    resourceType: "wallet",
    securityRelevant: false,
    customerVisible: true,
    retentionClass: "financial",
    description: "Credits granted from subscription or top-up",
  },

  // ─── Subscriptions ───────────────────────────────────────────
  {
    action: "subscription.created",
    sourceService: "subscription-service",
    resourceType: "subscription",
    securityRelevant: false,
    customerVisible: true,
    retentionClass: "standard",
    description: "Organization subscribed to plan tier",
  },
  {
    action: "subscription.cancelled",
    sourceService: "subscription-service",
    resourceType: "subscription",
    securityRelevant: false,
    customerVisible: true,
    retentionClass: "standard",
    description: "Organization subscription cancelled",
  },

  // ─── Payments ────────────────────────────────────────────────
  {
    action: "payment.refunded",
    sourceService: "payment-service",
    resourceType: "payment",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "financial",
    description: "Payment transaction refunded to customer",
  },

  // ─── Invoices & Tax ──────────────────────────────────────────
  {
    action: "invoice.issued",
    sourceService: "invoice-service",
    resourceType: "invoice",
    securityRelevant: false,
    customerVisible: true,
    retentionClass: "financial",
    description: "Tax invoice legally issued",
  },
  {
    action: "invoice.voided",
    sourceService: "invoice-service",
    resourceType: "invoice",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "financial",
    description: "Issued invoice voided",
  },

  // ─── Webhooks ────────────────────────────────────────────────
  {
    action: "webhook.secret_rotated",
    sourceService: "webhook-service",
    resourceType: "webhook_endpoint",
    securityRelevant: true,
    customerVisible: true,
    retentionClass: "security",
    description: "Webhook endpoint signing secret rotated",
  },

  // ─── Privileged & Break-Glass Operations ─────────────────────
  {
    action: "ops.break_glass_executed",
    sourceService: "privileged-access-service",
    resourceType: "system",
    securityRelevant: true,
    customerVisible: false,
    retentionClass: "privileged",
    description: "Emergency break-glass privileged capability executed",
  },
];

export function getAuditActionMetadata(action: string): AuditActionMetadata | undefined {
  return AUDIT_ACTION_CATALOG.find((a) => a.action === action);
}
