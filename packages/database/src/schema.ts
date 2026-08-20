import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = { createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() };
export const userStatus = pgEnum("user_status", ["active", "invited", "suspended", "disabled", "deleted"]);
export const organizationStatus = pgEnum("organization_status", ["active", "trial", "restricted", "suspended", "archived"]);
export const membershipStatus = pgEnum("membership_status", ["invited", "active", "suspended", "removed"]);
export const workspaceStatus = pgEnum("workspace_status", ["active", "restricted", "suspended", "archived"]);
export const environmentType = pgEnum("environment_type", ["development", "staging", "production", "custom"]);
export const actorType = pgEnum("actor_type", ["user", "service", "apiKey", "admin", "system"]);
export const apiKeyStatus = pgEnum("api_key_status", ["active", "expired", "revoked", "disabled"]);
export const policyEffect = pgEnum("policy_effect", ["allow", "deny"]);
export const limitWindow = pgEnum("limit_window", ["minute", "hour", "day"]);
export const budgetMode = pgEnum("budget_mode", ["warn", "soft", "hard"]);
export const providerStatus = pgEnum("provider_status", ["active", "degraded", "maintenance", "disabled", "unavailable"]);
export const modelStatus = pgEnum("model_status", ["active", "preview", "beta", "deprecated", "disabled", "unavailable"]);
export const requestStatus = pgEnum("gateway_request_status", ["accepted", "routing", "executing", "streaming", "completed", "failed", "cancelled"]);
export const attemptStatus = pgEnum("provider_attempt_status", ["started", "streaming", "completed", "failed", "cancelled"]);
export const walletStatus = pgEnum("wallet_status", ["active", "restricted", "suspended", "closed"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "paused", "cancelled", "expired", "incomplete"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "authorized", "paid", "failed", "refunded", "partially_refunded", "disputed", "cancelled"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "open", "paid", "past_due", "void", "uncollectible", "refunded"]);
export const planVersionStatus = pgEnum("plan_version_status", ["draft", "active", "archived", "grandfathered"]);
export const entitlementType = pgEnum("entitlement_type", ["boolean", "integer", "decimal", "string", "set"]);
export const subscriptionFundingMode = pgEnum("subscription_funding_mode", ["manual", "free", "external_payment_future", "enterprise_contract"]);
export const subscriptionPeriodStatus = pgEnum("subscription_period_status", ["pending", "active", "renewed", "expired"]);
export const taxRegime = pgEnum("tax_regime", ["INDIA_GST", "EU_VAT", "UK_VAT", "US_SALES_TAX", "OTHER"]);
export const taxTreatment = pgEnum("tax_treatment", ["standard", "zero_rated", "exempt", "reverse_charge", "out_of_scope"]);
export const creditNoteStatus = pgEnum("credit_note_status", ["issued", "applied", "void"]);
export const fileStatus = pgEnum("file_status", ["pending_upload", "uploading", "uploaded", "processing", "ready", "rejected", "quarantined", "deleting", "deleted", "expired", "failed"]);
export const filePurpose = pgEnum("file_purpose", ["ai_input", "image_input", "audio_input", "document_input", "batch_input", "batch_output", "invoice_document", "generated_artifact", "provider_transfer", "internal"]);
export const fileSafetyState = pgEnum("file_safety_state", ["not_scanned", "pending", "clean", "rejected", "quarantined"]);
export const fileUploadSessionStatus = pgEnum("file_upload_session_status", ["pending", "active", "completed", "aborted", "expired"]);
export const fileUploadType = pgEnum("file_upload_type", ["single", "multipart"]);
export const fileProviderReferenceStatus = pgEnum("file_provider_reference_status", ["pending", "ready", "expired", "failed"]);
export const batchJobStatus = pgEnum("batch_job_status", ["validating", "queued", "running", "finalizing", "completed", "partially_completed", "failed", "cancelling", "cancelled", "expired"]);
export const batchItemStatus = pgEnum("batch_item_status", ["pending", "queued", "running", "succeeded", "failed", "retry_wait", "cancelled"]);
export const batchChunkStatus = pgEnum("batch_chunk_status", ["pending", "in_progress", "completed", "failed"]);
export const batchReservationStatus = pgEnum("batch_reservation_status", ["reserved", "partially_settled", "settled", "released"]);
export const routingWorkloadType = pgEnum("routing_workload_type", ["realtime_interactive", "realtime_background", "batch", "embedding", "image", "audio", "document", "reasoning", "tool_call", "structured_generation"]);
export const routingLatencyClass = pgEnum("routing_latency_class", ["ultra_low", "interactive", "standard", "throughput"]);
export const routingObjective = pgEnum("routing_objective", ["balanced", "lowest_latency", "lowest_cost", "highest_reliability", "highest_throughput", "pinned", "custom_policy"]);
export const trafficControlMode = pgEnum("traffic_control_mode", ["active", "draining", "disabled", "canary"]);

export const users = pgTable("users", { id: text().primaryKey(), name: text().notNull(), email: text().notNull(), emailVerified: boolean("email_verified").notNull().default(false), avatarUrl: text("avatar_url"), status: userStatus().notNull().default("active"), locale: text().notNull().default("en"), timezone: text().notNull().default("UTC"), lastLoginAt: timestamp("last_login_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`), index("users_status_idx").on(table.status)]);
export const accounts = pgTable("accounts", { id: text().primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }), providerId: text("provider_id").notNull(), accountId: text("account_id").notNull(), passwordHash: text("password_hash"), accessTokenEncrypted: text("access_token_encrypted"), refreshTokenEncrypted: text("refresh_token_encrypted"), idTokenEncrypted: text("id_token_encrypted"), accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }), refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }), scope: text(), ...timestamps }, (table) => [uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId), index("accounts_user_idx").on(table.userId)]);
export const sessions = pgTable("sessions", { id: text().primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(), ipAddress: text("ip_address"), userAgent: text("user_agent"), deviceName: text("device_name"), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);
export const verificationTokens = pgTable("verification_tokens", { id: text().primaryKey(), userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), identifier: text().notNull(), purpose: text().notNull(), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("verification_token_hash_unique").on(table.tokenHash), index("verification_identifier_idx").on(table.identifier)]);
export const verifications = pgTable("verifications", { id: text().primaryKey(), identifier: text().notNull(), value: text().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), ...timestamps }, (table) => [index("verifications_identifier_idx").on(table.identifier), index("verifications_expiry_idx").on(table.expiresAt)]);

export const organizations = pgTable("organizations", { id: text().primaryKey(), name: text().notNull(), slug: text().notNull(), logoUrl: text("logo_url"), status: organizationStatus().notNull().default("trial"), ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), billingEmail: text("billing_email"), country: text(), defaultCurrency: text("default_currency").notNull().default("USD"), timezone: text().notNull().default("UTC"), archivedAt: timestamp("archived_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("organizations_slug_unique").on(table.slug), check("organizations_currency_length", sql`length(${table.defaultCurrency}) = 3`)]);
export const organizationMembers = pgTable("organization_members", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }), status: membershipStatus().notNull().default("invited"), joinedAt: timestamp("joined_at", { withTimezone: true }), invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }), ...timestamps }, (table) => [uniqueIndex("organization_members_tenant_user_unique").on(table.organizationId, table.userId), index("organization_members_org_idx").on(table.organizationId), index("organization_members_user_idx").on(table.userId)]);
export const organizationInvitations = pgTable("organization_invitations", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), email: text().notNull(), roleId: text("role_id").notNull(), tokenHash: text("token_hash").notNull(), invitedBy: text("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), acceptedAt: timestamp("accepted_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("organization_invitations_token_unique").on(table.tokenHash), index("organization_invitations_org_email_idx").on(table.organizationId, table.email)]);
export const teams = pgTable("teams", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), name: text().notNull(), slug: text().notNull(), description: text(), ...timestamps }, (table) => [uniqueIndex("teams_org_slug_unique").on(table.organizationId, table.slug), index("teams_org_idx").on(table.organizationId)]);
export const teamMembers = pgTable("team_members", { teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }), organizationMemberId: text("organization_member_id").notNull().references(() => organizationMembers.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [primaryKey({ columns: [table.teamId, table.organizationMemberId] })]);

export const workspaces = pgTable("workspaces", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), name: text().notNull(), slug: text().notNull(), description: text(), status: workspaceStatus().notNull().default("active"), region: text().notNull().default("auto"), defaultEnvironmentId: text("default_environment_id"), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), archivedAt: timestamp("archived_at", { withTimezone: true }), settings: jsonb().notNull().default({}), ...timestamps }, (table) => [uniqueIndex("workspaces_org_slug_unique").on(table.organizationId, table.slug), index("workspaces_org_idx").on(table.organizationId)]);
export const workspaceMembers = pgTable("workspace_members", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }), status: membershipStatus().notNull().default("active"), ...timestamps }, (table) => [uniqueIndex("workspace_members_tenant_user_unique").on(table.organizationId, table.workspaceId, table.userId), index("workspace_members_workspace_idx").on(table.workspaceId), index("workspace_members_user_idx").on(table.userId)]);
export const workspaceTeams = pgTable("workspace_teams", { organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }) }, (table) => [primaryKey({ columns: [table.workspaceId, table.teamId] })]);
export const environments = pgTable("environments", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), name: text().notNull(), slug: text().notNull(), type: environmentType().notNull(), status: workspaceStatus().notNull().default("active"), ...timestamps }, (table) => [uniqueIndex("environments_workspace_slug_unique").on(table.organizationId, table.workspaceId, table.slug), index("environments_workspace_idx").on(table.workspaceId)]);

export const apiKeys = pgTable("api_keys", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }), environmentId: text("environment_id").notNull().references(() => environments.id, { onDelete: "restrict" }), name: text().notNull(), prefix: text().notNull(), secretHash: text("secret_hash").notNull(), status: apiKeyStatus().notNull().default("active"), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), expiresAt: timestamp("expires_at", { withTimezone: true }), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), revokedBy: text("revoked_by").references(() => users.id, { onDelete: "restrict" }), ...timestamps }, (table) => [uniqueIndex("api_keys_prefix_unique").on(table.prefix), index("api_keys_org_idx").on(table.organizationId), index("api_keys_workspace_idx").on(table.workspaceId), index("api_keys_environment_idx").on(table.environmentId), index("api_keys_status_idx").on(table.status), index("api_keys_expiry_idx").on(table.status, table.expiresAt), index("api_keys_last_used_idx").on(table.lastUsedAt), index("api_keys_org_workspace_idx").on(table.organizationId, table.workspaceId), index("api_keys_workspace_environment_idx").on(table.workspaceId, table.environmentId)]);
export const apiKeyPermissions = pgTable("api_key_permissions", { apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }), permission: text().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [primaryKey({ columns: [table.apiKeyId, table.permission] })]);
export const apiKeyModelRules = pgTable("api_key_model_rules", { id: text().primaryKey(), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }), effect: policyEffect().notNull(), pattern: text().notNull(), category: text(), maximumCostMinor: integer("maximum_cost_minor"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("api_key_model_rules_key_idx").on(table.apiKeyId)]);
export const apiKeyRateLimits = pgTable("api_key_rate_limits", { id: text().primaryKey(), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }), window: limitWindow().notNull(), requestLimit: integer("request_limit").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("api_key_rate_limits_key_window_unique").on(table.apiKeyId, table.window), check("api_key_rate_limits_positive", sql`${table.requestLimit} > 0`)]);
export const apiKeySpendingLimits = pgTable("api_key_spending_limits", { apiKeyId: text("api_key_id").primaryKey().references(() => apiKeys.id, { onDelete: "cascade" }), mode: budgetMode().notNull(), perRequestMinor: integer("per_request_minor"), dailyMinor: integer("daily_minor"), monthlyMinor: integer("monthly_minor"), currency: text().notNull().default("USD"), policyVersion: integer("policy_version").notNull().default(1), ...timestamps }, (table) => [check("api_key_spending_currency_length", sql`length(${table.currency}) = 3`)]);
export const apiKeyIpAllowlists = pgTable("api_key_ip_allowlists", { id: text().primaryKey(), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }), cidr: text().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("api_key_ip_allowlists_key_cidr_unique").on(table.apiKeyId, table.cidr)]);
export const apiKeyUsageSnapshots = pgTable("api_key_usage_snapshots", { id: text().primaryKey(), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "restrict" }), periodStart: timestamp("period_start", { withTimezone: true }).notNull(), periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), requestCount: integer("request_count").notNull().default(0), spendMinor: integer("spend_minor").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("api_key_usage_period_unique").on(table.apiKeyId, table.periodStart, table.periodEnd)]);

export const providers = pgTable(
  "providers",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    status: providerStatus().notNull().default("active"),
    adapterType: text("adapter_type").notNull(),
    baseUrl: text("base_url").notNull(),
    apiVersion: text("api_version"),
    region: text().notNull().default("global"),
    priority: integer().notNull().default(100),
    enabled: boolean().notNull().default(true),
    metadata: jsonb().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("providers_slug_unique").on(table.slug),
    index("providers_status_idx").on(table.status),
  ]
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: text().primaryKey(),
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").references(() => environments.id, { onDelete: "cascade" }),
    status: providerStatus().notNull().default("active"),
    ...timestamps,
  },
  (table) => [index("provider_connections_scope_idx").on(table.organizationId, table.workspaceId, table.environmentId)]
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: text().primaryKey(),
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => providerConnections.id, { onDelete: "cascade" }),
    name: text().notNull().default("default"),
    environment: text().notNull().default("production"),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionKeyVersion: text("encryption_key_version").notNull().default("v1"),
    status: text().notNull().default("active"),
    metadata: jsonb().notNull().default({}),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("provider_credentials_provider_idx").on(table.providerId),
    index("provider_credentials_status_idx").on(table.status),
    index("provider_credentials_env_idx").on(table.environment),
    uniqueIndex("provider_credentials_provider_name_env_unique").on(table.providerId, table.name, table.environment),
  ]
);

export const canonicalModels = pgTable(
  "canonical_models",
  {
    id: text().primaryKey(),
    canonicalId: text("canonical_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    family: text().notNull(),
    category: text().notNull().default("chat"),
    status: text().notNull().default("active"),
    customerVisible: boolean("customer_visible").notNull().default(true),
    routingEligible: boolean("routing_eligible").notNull().default(true),
    description: text().notNull().default(""),
    contextWindow: integer("context_window").notNull(),
    maxInputTokens: integer("max_input_tokens"),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    supportsStreaming: boolean("supports_streaming").notNull().default(true),
    supportsTools: boolean("supports_tools").notNull().default(false),
    supportsStructuredOutput: boolean("supports_structured_output").notNull().default(false),
    supportsReasoning: boolean("supports_reasoning").notNull().default(false),
    inputModalities: jsonb("input_modalities").notNull().default(sql`'["text"]'::jsonb`),
    outputModalities: jsonb("output_modalities").notNull().default(sql`'["text"]'::jsonb`),
    reasoningMetadata: jsonb("reasoning_metadata"),
    toolMetadata: jsonb("tool_metadata"),
    structuredOutputMetadata: jsonb("structured_output_metadata"),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    sunsetAt: timestamp("sunset_at", { withTimezone: true }),
    replacementModelId: text("replacement_model_id"),
    deprecationMessage: text("deprecation_message"),
    metadata: jsonb().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("canonical_models_canonical_id_unique").on(table.canonicalId),
    index("canonical_models_status_idx").on(table.status),
    index("canonical_models_family_idx").on(table.family),
    index("canonical_models_category_idx").on(table.category),
    index("canonical_models_visibility_idx").on(table.customerVisible, table.routingEligible),
  ]
);

export const canonicalModelCapabilities = pgTable(
  "canonical_model_capabilities",
  {
    modelId: text("model_id").notNull().references(() => canonicalModels.id, { onDelete: "cascade" }),
    capability: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.modelId, table.capability] })]
);

export const modelProviderRoutes = pgTable(
  "model_provider_routes",
  {
    id: text().primaryKey(),
    modelId: text("model_id").notNull().references(() => canonicalModels.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }),
    providerModelId: text("provider_model_id").notNull(),
    region: text().notNull().default("global"),
    status: text().notNull().default("active"),
    routingEligible: boolean("routing_eligible").notNull().default(true),
    priority: integer().notNull().default(100),
    contextWindowOverride: integer("context_window_override"),
    maxOutputTokensOverride: integer("max_output_tokens_override"),
    capabilitiesOverrides: jsonb("capabilities_overrides"),
    pricingReference: text("pricing_reference"),
    availableFrom: timestamp("available_from", { withTimezone: true }),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    metadata: jsonb().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("model_provider_routes_provider_model_region_unique").on(table.providerId, table.providerModelId, table.region),
    index("model_provider_routes_model_idx").on(table.modelId),
    index("model_provider_routes_status_idx").on(table.status, table.routingEligible),
  ]
);

export const canonicalModelAliases = pgTable(
  "canonical_model_aliases",
  {
    id: text().primaryKey(),
    alias: text().notNull().unique(),
    canonicalModelId: text("canonical_model_id").notNull(),
    status: text().notNull().default("active"),
    type: text().notNull().default("static"),
    description: text(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("canonical_model_aliases_alias_unique").on(table.alias),
    index("canonical_model_aliases_target_idx").on(table.canonicalModelId),
  ]
);

export const canonicalModelPricing = pgTable(
  "canonical_model_pricing",
  {
    id: text().primaryKey(),
    modelId: text("model_id").references(() => canonicalModels.id, { onDelete: "cascade" }),
    routeId: text("route_id").references(() => modelProviderRoutes.id, { onDelete: "cascade" }),
    pricingType: text("pricing_type").notNull().default("standard"),
    inputPricePerMillionMinor: bigint("input_price_per_million_minor", { mode: "bigint" }).notNull(),
    outputPricePerMillionMinor: bigint("output_price_per_million_minor", { mode: "bigint" }).notNull(),
    cachedInputPricePerMillionMinor: bigint("cached_input_price_per_million_minor", { mode: "bigint" }),
    reasoningPricePerMillionMinor: bigint("reasoning_price_per_million_minor", { mode: "bigint" }),
    currency: text().notNull().default("USD"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    source: text().notNull().default("manual"),
    metadata: jsonb().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("canonical_model_pricing_model_idx").on(table.modelId, table.effectiveFrom),
    index("canonical_model_pricing_route_idx").on(table.routeId, table.effectiveFrom),
  ]
);

export const providerModels = pgTable("provider_models", { id: text().primaryKey(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), providerModelId: text("provider_model_id").notNull(), publicModelId: text("public_model_id").notNull(), displayName: text("display_name").notNull(), description: text().notNull().default(""), status: modelStatus().notNull().default("active"), contextWindow: integer("context_window").notNull(), maxOutputTokens: integer("max_output_tokens").notNull(), ...timestamps }, (table) => [uniqueIndex("provider_models_public_unique").on(table.publicModelId), uniqueIndex("provider_models_native_unique").on(table.providerId, table.providerModelId), index("provider_models_status_idx").on(table.status)]);
export const providerModelCapabilities = pgTable("provider_model_capabilities", { providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "cascade" }), capability: text().notNull() }, (table) => [primaryKey({ columns: [table.providerModelId, table.capability] })]);
export const providerHealthSnapshots = pgTable("provider_health_snapshots", { id: text().primaryKey(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }), state: text().notNull(), latencyMs: integer("latency_ms"), successRateBasisPoints: integer("success_rate_basis_points"), sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull() }, (table) => [index("provider_health_provider_sample_idx").on(table.providerId, table.sampledAt)]);
export const providerPricingVersions = pgTable("provider_pricing_versions", { id: text().primaryKey(), providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "restrict" }), currency: text().notNull(), inputPerMillionMinor: integer("input_per_million_minor").notNull(), outputPerMillionMinor: integer("output_per_million_minor").notNull(), cachedPerMillionMinor: integer("cached_per_million_minor"), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const modelAliases = pgTable("model_aliases", { id: text().primaryKey(), alias: text().notNull().unique(), displayName: text("display_name").notNull(), status: modelStatus().notNull().default("active"), ...timestamps });
export const modelAliasVersions = pgTable("model_alias_versions", { id: text().primaryKey(), aliasId: text("alias_id").notNull().references(() => modelAliases.id, { onDelete: "restrict" }), version: text().notNull(), targets: jsonb().notNull(), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), status: text().notNull().default("active"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("model_alias_versions_unique").on(table.aliasId, table.version)]);
export const modelAvailability = pgTable("model_availability", { id: text().primaryKey(), providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "cascade" }), region: text().notNull(), environmentType: environmentType("environment_type").notNull(), available: boolean().notNull().default(true), ...timestamps }, (table) => [uniqueIndex("model_availability_scope_unique").on(table.providerModelId, table.region, table.environmentType)]);
export const modelDeprecations = pgTable("model_deprecations", { providerModelId: text("provider_model_id").primaryKey().references(() => providerModels.id, { onDelete: "cascade" }), announcedAt: timestamp("announced_at", { withTimezone: true }).notNull(), shutdownAt: timestamp("shutdown_at", { withTimezone: true }), replacementModelId: text("replacement_model_id"), message: text().notNull() });
export const routingPolicies = pgTable("routing_policies", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }), name: text().notNull(), enabled: boolean().notNull().default(true), ...timestamps });
export const routingPolicyVersions = pgTable("routing_policy_versions", { id: text().primaryKey(), routingPolicyId: text("routing_policy_id").notNull().references(() => routingPolicies.id, { onDelete: "restrict" }), version: text().notNull(), configuration: jsonb().notNull(), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("routing_policy_version_unique").on(table.routingPolicyId, table.version)]);
export const routingRules = pgTable("routing_rules", { id: text().primaryKey(), routingPolicyVersionId: text("routing_policy_version_id").notNull().references(() => routingPolicyVersions.id, { onDelete: "cascade" }), priority: integer().notNull(), condition: jsonb().notNull(), target: jsonb().notNull() });
export const fallbackChains = pgTable("fallback_chains", { id: text().primaryKey(), routingPolicyVersionId: text("routing_policy_version_id").notNull().references(() => routingPolicyVersions.id, { onDelete: "cascade" }), name: text().notNull(), targets: jsonb().notNull(), maxAttempts: integer("max_attempts").notNull() });
export const gatewayRequests = pgTable("gateway_requests", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }), environmentId: text("environment_id").notNull().references(() => environments.id, { onDelete: "restrict" }), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "restrict" }), requestedModel: text("requested_model").notNull(), resolvedModel: text("resolved_model"), status: requestStatus().notNull(), stream: boolean().notNull().default(false), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }), latencyMs: integer("latency_ms"), errorCode: text("error_code"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("gateway_requests_tenant_created_idx").on(table.organizationId, table.workspaceId, table.createdAt), index("gateway_requests_key_idx").on(table.apiKeyId)]);
export const routingDecisions = pgTable("routing_decisions", { id: text().primaryKey(), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), requestedModel: text("requested_model").notNull(), resolvedModel: text("resolved_model").notNull(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "restrict" }), routingPolicyVersionId: text("routing_policy_version_id").references(() => routingPolicyVersions.id, { onDelete: "restrict" }), selectionReason: text("selection_reason").notNull(), fallbackChain: jsonb("fallback_chain").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("routing_decisions_request_unique").on(table.requestId)]);
export const providerAttempts = pgTable("provider_attempts", { id: text().primaryKey(), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "restrict" }), attemptNumber: integer("attempt_number").notNull(), status: attemptStatus().notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), firstTokenAt: timestamp("first_token_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), latencyMs: integer("latency_ms"), errorCode: text("error_code"), providerRequestId: text("provider_request_id") }, (table) => [uniqueIndex("provider_attempts_request_number_unique").on(table.requestId, table.attemptNumber)]);
export const usageRecords = pgTable("usage_records", { id: text().primaryKey(), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), eventId: text("event_id").notNull().unique(), providerPricingVersionId: text("provider_pricing_version_id").references(() => providerPricingVersions.id, { onDelete: "restrict" }), providerCurrency: text("provider_currency"), estimatedProviderCostMinor: integer("estimated_provider_cost_minor"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const tokenUsageRecords = pgTable("token_usage_records", { usageRecordId: text("usage_record_id").primaryKey().references(() => usageRecords.id, { onDelete: "cascade" }), inputTokens: integer("input_tokens").notNull(), outputTokens: integer("output_tokens").notNull(), cachedInputTokens: integer("cached_input_tokens").notNull().default(0), reasoningTokens: integer("reasoning_tokens").notNull().default(0), totalTokens: integer("total_tokens").notNull() });
export const latencyRecords = pgTable("latency_records", { requestId: text("request_id").primaryKey().references(() => gatewayRequests.id, { onDelete: "cascade" }), gatewayOverheadMs: integer("gateway_overhead_ms"), providerLatencyMs: integer("provider_latency_ms"), timeToFirstTokenMs: integer("time_to_first_token_ms"), totalLatencyMs: integer("total_latency_ms").notNull() });
export const errorRecords = pgTable("error_records", { id: text().primaryKey(), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), providerAttemptId: text("provider_attempt_id").references(() => providerAttempts.id, { onDelete: "restrict" }), code: text().notNull(), retryable: boolean().notNull(), safeMessage: text("safe_message").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("error_records_request_idx").on(table.requestId)]);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text().primaryKey(),
    eventId: text("event_id").notNull().unique(),
    requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
    attemptId: text("attempt_id").references(() => providerAttempts.id, { onDelete: "restrict" }),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "restrict" }),
    canonicalModelId: text("canonical_model_id").notNull(),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    providerRouteId: text("provider_route_id"),
    usageType: text("usage_type").notNull(),
    quantity: bigint("quantity", { mode: "bigint" }).notNull(),
    unit: text().notNull().default("token"),
    source: text().notNull().default("provider_reported"),
    confidence: text().notNull().default("exact"),
    workloadType: text("workload_type").notNull().default("customer"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reconciliationGroupId: text("reconciliation_group_id"),
    reversalOfId: text("reversal_of_id"),
    metadata: jsonb().notNull().default({}),
  },
  (table) => [
    uniqueIndex("usage_events_idempotency_unique").on(table.idempotencyKey),
    index("usage_events_request_idx").on(table.requestId),
    index("usage_events_tenant_occurred_idx").on(table.organizationId, table.workspaceId, table.occurredAt),
    index("usage_events_type_idx").on(table.usageType),
  ]
);

export const usageReconciliations = pgTable(
  "usage_reconciliations",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
    attemptId: text("attempt_id").references(() => providerAttempts.id, { onDelete: "restrict" }),
    originalEventId: text("original_event_id"),
    adjustmentEventId: text("adjustment_event_id").notNull(),
    previousQuantity: bigint("previous_quantity", { mode: "bigint" }).notNull(),
    newQuantity: bigint("new_quantity", { mode: "bigint" }).notNull(),
    differenceQuantity: bigint("difference_quantity", { mode: "bigint" }).notNull(),
    usageType: text("usage_type").notNull(),
    reason: text().notNull(),
    operatorId: text("operator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_reconciliations_request_idx").on(table.requestId)]
);

export const usageHourlyAggregates = pgTable(
  "usage_hourly_aggregates",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "restrict" }),
    canonicalModelId: text("canonical_model_id"),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true }).notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    reasoningTokens: bigint("reasoning_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    requestCount: integer("request_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_hourly_agg_tenant_bucket_idx").on(table.organizationId, table.workspaceId, table.bucketStart),
  ]
);

export const usageDailyAggregates = pgTable(
  "usage_daily_aggregates",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "restrict" }),
    canonicalModelId: text("canonical_model_id"),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true }).notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    reasoningTokens: bigint("reasoning_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    requestCount: integer("request_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_daily_agg_tenant_bucket_idx").on(table.organizationId, table.workspaceId, table.bucketStart),
  ]
);

export const analyticsHourlyRollups = pgTable(
  "analytics_hourly_rollups",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "restrict" }),
    canonicalModelId: text("canonical_model_id"),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    routeId: text("route_id"),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true }).notNull(),
    requestsTotal: integer("requests_total").notNull().default(0),
    requestsCompleted: integer("requests_completed").notNull().default(0),
    requestsFailed: integer("requests_failed").notNull().default(0),
    requestsCancelled: integer("requests_cancelled").notNull().default(0),
    requestsRejected: integer("requests_rejected").notNull().default(0),
    providerAttempts: integer("provider_attempts").notNull().default(0),
    retryAttempts: integer("retry_attempts").notNull().default(0),
    fallbackAttempts: integer("fallback_attempts").notNull().default(0),
    streamRequests: integer("stream_requests").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    reasoningTokens: bigint("reasoning_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerInputTokens: bigint("provider_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerOutputTokens: bigint("provider_output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerTotalTokens: bigint("provider_total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    latencySketch: jsonb("latency_sketch").notNull(),
    ttftSketch: jsonb("ttft_sketch").notNull(),
    errorCounts: jsonb("error_counts").notNull().default(sql`'{}'::jsonb`),
    policyDenialCounts: jsonb("policy_denial_counts").notNull().default(sql`'{}'::jsonb`),
    quotaDenialCounts: jsonb("quota_denial_counts").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("analytics_hourly_tenant_bucket_idx").on(table.organizationId, table.workspaceId, table.bucketStart),
    index("analytics_hourly_model_idx").on(table.canonicalModelId, table.bucketStart),
    index("analytics_hourly_provider_idx").on(table.providerId, table.bucketStart),
  ]
);

export const analyticsDailyRollups = pgTable(
  "analytics_daily_rollups",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "restrict" }),
    canonicalModelId: text("canonical_model_id"),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    routeId: text("route_id"),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true }).notNull(),
    requestsTotal: integer("requests_total").notNull().default(0),
    requestsCompleted: integer("requests_completed").notNull().default(0),
    requestsFailed: integer("requests_failed").notNull().default(0),
    requestsCancelled: integer("requests_cancelled").notNull().default(0),
    requestsRejected: integer("requests_rejected").notNull().default(0),
    providerAttempts: integer("provider_attempts").notNull().default(0),
    retryAttempts: integer("retry_attempts").notNull().default(0),
    fallbackAttempts: integer("fallback_attempts").notNull().default(0),
    streamRequests: integer("stream_requests").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    reasoningTokens: bigint("reasoning_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerInputTokens: bigint("provider_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerOutputTokens: bigint("provider_output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    providerTotalTokens: bigint("provider_total_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    latencySketch: jsonb("latency_sketch").notNull(),
    ttftSketch: jsonb("ttft_sketch").notNull(),
    errorCounts: jsonb("error_counts").notNull().default(sql`'{}'::jsonb`),
    policyDenialCounts: jsonb("policy_denial_counts").notNull().default(sql`'{}'::jsonb`),
    quotaDenialCounts: jsonb("quota_denial_counts").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("analytics_daily_tenant_bucket_idx").on(table.organizationId, table.workspaceId, table.bucketStart),
    index("analytics_daily_model_idx").on(table.canonicalModelId, table.bucketStart),
    index("analytics_daily_provider_idx").on(table.providerId, table.bucketStart),
  ]
);

export const analyticsCheckpoints = pgTable(
  "analytics_checkpoints",
  {
    id: text().primaryKey(),
    projectorName: text("projector_name").notNull().unique(),
    lastProcessedEventId: text("last_processed_event_id"),
    lastProcessedTimestamp: timestamp("last_processed_timestamp", { withTimezone: true }),
    processedEventsCount: bigint("processed_events_count", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const analyticsAnomalies = pgTable(
  "analytics_anomalies",
  {
    id: text().primaryKey(),
    anomalyType: text("anomaly_type").notNull(),
    severity: text().notNull(),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    canonicalModelId: text("canonical_model_id"),
    observedValue: real("observed_value").notNull(),
    baselineValue: real("baseline_value").notNull(),
    threshold: real().notNull(),
    details: jsonb().notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("analytics_anomalies_tenant_detected_idx").on(table.organizationId, table.workspaceId, table.detectedAt),
    index("analytics_anomalies_type_idx").on(table.anomalyType, table.detectedAt),
  ]
);


export const routingConditions = pgTable("routing_conditions", { id: text().primaryKey(), routingRuleId: text("routing_rule_id").notNull().references(() => routingRules.id, { onDelete: "cascade" }), field: text().notNull(), operator: text().notNull(), value: jsonb().notNull() });
export const routingActions = pgTable("routing_actions", { id: text().primaryKey(), routingRuleId: text("routing_rule_id").notNull().references(() => routingRules.id, { onDelete: "cascade" }), action: text().notNull(), configuration: jsonb().notNull() });
export const trafficAllocations = pgTable("traffic_allocations", { id: text().primaryKey(), routingPolicyVersionId: text("routing_policy_version_id").notNull().references(() => routingPolicyVersions.id, { onDelete: "cascade" }), stableKey: text("stable_key").notNull(), allocation: jsonb().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const providerWeights = pgTable("provider_weights", { routingPolicyVersionId: text("routing_policy_version_id").notNull().references(() => routingPolicyVersions.id, { onDelete: "cascade" }), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), weightBasisPoints: integer("weight_basis_points").notNull() }, (table) => [primaryKey({ columns: [table.routingPolicyVersionId, table.providerId] }), check("provider_weight_range", sql`${table.weightBasisPoints} >= 0 AND ${table.weightBasisPoints} <= 10000`)]);
export const routingCandidateScores = pgTable("routing_candidate_scores", { id: text().primaryKey(), routingDecisionId: text("routing_decision_id").notNull().references(() => routingDecisions.id, { onDelete: "cascade" }), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), providerModelId: text("provider_model_id").notNull().references(() => providerModels.id, { onDelete: "restrict" }), costScoreBasisPoints: integer("cost_score_basis_points").notNull(), latencyScoreBasisPoints: integer("latency_score_basis_points").notNull(), reliabilityScoreBasisPoints: integer("reliability_score_basis_points").notNull(), capacityScoreBasisPoints: integer("capacity_score_basis_points").notNull(), preferenceScoreBasisPoints: integer("preference_score_basis_points").notNull(), finalScoreBasisPoints: integer("final_score_basis_points").notNull(), eligible: boolean().notNull(), rejectionReason: text("rejection_reason") }, (table) => [index("routing_candidate_scores_decision_idx").on(table.routingDecisionId)]);
export const providerCapacityLimits = pgTable("provider_capacity_limits", { id: text().primaryKey(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }), connectionId: text("connection_id").references(() => providerConnections.id, { onDelete: "cascade" }), providerModelId: text("provider_model_id").references(() => providerModels.id, { onDelete: "cascade" }), maximumConcurrency: integer("maximum_concurrency").notNull(), requestsPerMinute: integer("requests_per_minute").notNull(), tokensPerMinute: integer("tokens_per_minute").notNull(), safetyMarginBasisPoints: integer("safety_margin_basis_points").notNull().default(8000), ...timestamps });
export const providerCapacitySnapshots = pgTable("provider_capacity_snapshots", { id: text().primaryKey(), capacityLimitId: text("capacity_limit_id").notNull().references(() => providerCapacityLimits.id, { onDelete: "cascade" }), currentConcurrency: integer("current_concurrency").notNull(), requestsPerMinute: integer("requests_per_minute").notNull(), tokensPerMinute: integer("tokens_per_minute").notNull(), utilizationBasisPoints: integer("utilization_basis_points").notNull(), state: text().notNull(), recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull() }, (table) => [index("provider_capacity_snapshot_limit_time_idx").on(table.capacityLimitId, table.recordedAt)]);
export const providerCircuitStates = pgTable("provider_circuit_states", { id: text().primaryKey(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }), providerModelId: text("provider_model_id").references(() => providerModels.id, { onDelete: "cascade" }), connectionId: text("connection_id").references(() => providerConnections.id, { onDelete: "cascade" }), state: text().notNull(), requests: integer().notNull().default(0), failures: integer().notNull().default(0), halfOpenAttempts: integer("half_open_attempts").notNull().default(0), halfOpenSuccesses: integer("half_open_successes").notNull().default(0), openedAt: timestamp("opened_at", { withTimezone: true }), version: integer().notNull().default(1), ...timestamps }, (table) => [uniqueIndex("provider_circuit_scope_unique").on(table.providerId, table.providerModelId, table.connectionId)]);
export const providerMaintenanceWindows = pgTable("provider_maintenance_windows", { id: text().primaryKey(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), reason: text().notNull(), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("provider_maintenance_provider_time_idx").on(table.providerId, table.startsAt, table.endsAt)]);
export const cacheRecords = pgTable("cache_records", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), fingerprint: text().notNull(), model: text().notNull(), modelVersion: text("model_version").notNull(), providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }), responseReference: text("response_reference").notNull(), responseHash: text("response_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("cache_records_tenant_fingerprint_unique").on(table.organizationId, table.workspaceId, table.fingerprint), index("cache_records_expiry_idx").on(table.expiresAt)]);
export const idempotencyRecords = pgTable("idempotency_records", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), endpoint: text().notNull(), idempotencyKeyHash: text("idempotency_key_hash").notNull(), requestHash: text("request_hash").notNull(), status: text().notNull(), responseReference: text("response_reference"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("idempotency_records_scope_key_unique").on(table.organizationId, table.workspaceId, table.endpoint, table.idempotencyKeyHash), index("idempotency_records_expiry_idx").on(table.expiresAt)]);

export const billingAccounts = pgTable("billing_accounts", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }).unique(), currency: text().notNull(), status: text().notNull().default("active"), overagePolicy: text("overage_policy").notNull().default("none"), graceCredits: bigint("grace_credits", { mode: "bigint" }).notNull().default(sql`0`), ...timestamps }, (table) => [check("billing_accounts_currency", sql`length(${table.currency}) = 3`)]);
export const billingProfiles = pgTable("billing_profiles", { id: text().primaryKey(), billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "cascade" }), legalName: text("legal_name").notNull(), billingEmail: text("billing_email").notNull(), address: jsonb().notNull(), country: text().notNull(), taxId: text("tax_id"), purchaseOrder: text("purchase_order"), invoiceNotes: text("invoice_notes"), ...timestamps });
export const pricingVersions = pgTable("pricing_versions", { id: text().primaryKey(), version: integer().notNull().unique(), status: text().notNull(), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const pricingRules = pgTable("pricing_rules", { id: text().primaryKey(), pricingVersionId: text("pricing_version_id").notNull().references(() => pricingVersions.id, { onDelete: "restrict" }), level: text().notNull(), scopeId: text("scope_id"), method: text().notNull(), markupBasisPoints: integer("markup_basis_points"), fixedAmountMinor: bigint("fixed_amount_minor", { mode: "bigint" }), currency: text(), minimumMarginBasisPoints: integer("minimum_margin_basis_points").notNull(), configuration: jsonb().notNull().default({}) }, (table) => [index("pricing_rules_version_level_idx").on(table.pricingVersionId, table.level)]);
export const modelPrices = pgTable("model_prices", { id: text().primaryKey(), pricingVersionId: text("pricing_version_id").notNull().references(() => pricingVersions.id, { onDelete: "restrict" }), publicModelId: text("public_model_id").notNull(), inputPerMillionMinor: bigint("input_per_million_minor", { mode: "bigint" }).notNull(), outputPerMillionMinor: bigint("output_per_million_minor", { mode: "bigint" }).notNull(), cachedPerMillionMinor: bigint("cached_per_million_minor", { mode: "bigint" }).notNull().default(sql`0`), reasoningPerMillionMinor: bigint("reasoning_per_million_minor", { mode: "bigint" }).notNull().default(sql`0`), currency: text().notNull() }, (table) => [uniqueIndex("model_prices_version_model_unique").on(table.pricingVersionId, table.publicModelId)]);
export const creditConversionVersions = pgTable("credit_conversion_versions", { id: text().primaryKey(), version: integer().notNull().unique(), currency: text().notNull(), creditsNumerator: bigint("credits_numerator", { mode: "bigint" }).notNull(), moneyMinorDenominator: bigint("money_minor_denominator", { mode: "bigint" }).notNull(), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), status: text().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const creditWallets = pgTable("credit_wallets", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }).unique(), currency: text().notNull(), status: walletStatus().notNull().default("active"), cachedAvailableCredits: bigint("cached_available_credits", { mode: "bigint" }).notNull().default(sql`0`), cachedReservedCredits: bigint("cached_reserved_credits", { mode: "bigint" }).notNull().default(sql`0`), version: integer().notNull().default(1), ...timestamps });
export const creditGrants = pgTable("credit_grants", { id: text().primaryKey(), walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), type: text().notNull(), credits: bigint("credits", { mode: "bigint" }).notNull(), remainingCredits: bigint("remaining_credits", { mode: "bigint" }).notNull(), sourceType: text("source_type").notNull(), sourceId: text("source_id").notNull(), grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("credit_grants_wallet_expiry_idx").on(table.walletId, table.expiresAt), uniqueIndex("credit_grants_source_unique").on(table.sourceType, table.sourceId), check("credit_grants_nonnegative", sql`${table.credits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.remainingCredits} <= ${table.credits}`)]);
export const creditReservations = pgTable("credit_reservations", { id: text().primaryKey(), walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }), apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "restrict" }), estimatedCredits: bigint("estimated_credits", { mode: "bigint" }).notNull(), reservedCredits: bigint("reserved_credits", { mode: "bigint" }).notNull(), status: text().notNull(), allocations: jsonb().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), settledAt: timestamp("settled_at", { withTimezone: true }), releasedAt: timestamp("released_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("credit_reservations_request_unique").on(table.requestId), index("credit_reservations_wallet_status_idx").on(table.walletId, table.status)]);
export const creditAdjustments = pgTable("credit_adjustments", { id: text().primaryKey(), walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }), credits: bigint("credits", { mode: "bigint" }).notNull(), reason: text().notNull(), reference: text().notNull(), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), ledgerTransactionId: text("ledger_transaction_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });

export const paymentCustomers = pgTable("payment_customers", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), provider: text().notNull(), providerCustomerId: text("provider_customer_id").notNull(), status: text().notNull().default("active"), email: text(), ...timestamps }, (table) => [uniqueIndex("payment_customers_provider_cus_unique").on(table.provider, table.providerCustomerId), uniqueIndex("payment_customers_org_provider_unique").on(table.organizationId, table.provider), index("payment_customers_org_idx").on(table.organizationId)]);
export const paymentMethods = pgTable("payment_methods", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), provider: text().notNull(), externalPaymentMethodId: text("external_payment_method_id").notNull(), type: text().notNull(), display: jsonb().notNull().default({}), isDefault: boolean("is_default").notNull().default(false), status: text().notNull().default("active"), ...timestamps }, (table) => [uniqueIndex("payment_methods_provider_external_unique").on(table.provider, table.externalPaymentMethodId), index("payment_methods_org_idx").on(table.organizationId)]);
export const checkoutSessions = pgTable("checkout_sessions", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), provider: text().notNull(), purpose: text().notNull(), planId: text("plan_id").references(() => plans.id, { onDelete: "restrict" }), planVersionId: text("plan_version_id").references(() => planVersions.id, { onDelete: "restrict" }), amount: numeric("amount", { precision: 36, scale: 18 }).notNull(), currency: text().notNull(), status: text().notNull().default("created"), providerSessionId: text("provider_session_id"), checkoutUrl: text("checkout_url"), successReturnUrl: text("success_return_url").notNull(), cancelReturnUrl: text("cancel_return_url").notNull(), idempotencyKey: text("idempotency_key").notNull(), metadata: jsonb().notNull().default({}), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("checkout_sessions_org_idempotency_unique").on(table.organizationId, table.idempotencyKey), index("checkout_sessions_provider_session_idx").on(table.provider, table.providerSessionId), index("checkout_sessions_org_status_idx").on(table.organizationId, table.status)]);
export const payments = pgTable("payments", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), provider: text().notNull(), externalPaymentId: text("external_payment_id"), idempotencyKeyHash: text("idempotency_key_hash").notNull(), amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(), currency: text().notNull(), status: paymentStatus().notNull(), purpose: text().notNull(), referenceType: text("reference_type"), referenceId: text("reference_id"), failureCode: text("failure_code"), failureMessage: text("failure_message"), paidAt: timestamp("paid_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("payments_idempotency_unique").on(table.provider, table.idempotencyKeyHash), uniqueIndex("payments_provider_external_unique").on(table.provider, table.externalPaymentId), index("payments_org_status_idx").on(table.organizationId, table.status), check("payments_nonnegative", sql`${table.amountMinor} >= 0`)]);
export const paymentAttempts = pgTable("payment_attempts", { id: text().primaryKey(), paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }), provider: text().notNull(), providerAttemptId: text("provider_attempt_id"), attemptNumber: integer("attempt_number").notNull(), status: text().notNull().default("pending"), failureCode: text("failure_code"), failureCategory: text("failure_category"), failureMessage: text("failure_message"), startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }) }, (table) => [uniqueIndex("payment_attempts_payment_number_unique").on(table.paymentId, table.attemptNumber), index("payment_attempts_payment_idx").on(table.paymentId)]);
export const paymentEvents = pgTable("payment_events", { id: text().primaryKey(), provider: text().notNull(), externalEventId: text("external_event_id").notNull(), paymentId: text("payment_id").references(() => payments.id, { onDelete: "restrict" }), payloadHash: text("payload_hash").notNull(), eventType: text("event_type").notNull(), status: text().notNull(), attempts: integer().notNull().default(0), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(), processedAt: timestamp("processed_at", { withTimezone: true }), failure: text() }, (table) => [uniqueIndex("payment_events_provider_external_unique").on(table.provider, table.externalEventId), index("payment_events_status_idx").on(table.status, table.receivedAt)]);
export const refunds = pgTable("refunds", { id: text().primaryKey(), paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), provider: text().notNull(), externalRefundId: text("external_refund_id"), amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(), currency: text().notNull(), status: text().notNull(), reason: text().notNull(), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), ...timestamps }, (table) => [uniqueIndex("refunds_provider_external_unique").on(table.provider, table.externalRefundId), index("refunds_payment_idx").on(table.paymentId), check("refunds_positive", sql`${table.amountMinor} > 0`)]);

export const invoices = pgTable("invoices", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), subscriptionPeriodId: text("subscription_period_id").references(() => subscriptionPeriods.id, { onDelete: "restrict" }), number: text().notNull(), status: invoiceStatus().notNull(), currency: text().notNull(), subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(), discountMinor: bigint("discount_minor", { mode: "bigint" }).notNull().default(sql`0`), taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(sql`0`), totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(), amountPaidMinor: bigint("amount_paid_minor", { mode: "bigint" }).notNull().default(sql`0`), dueAt: timestamp("due_at", { withTimezone: true }), finalizedAt: timestamp("finalized_at", { withTimezone: true }), paidAt: timestamp("paid_at", { withTimezone: true }), voidedAt: timestamp("voided_at", { withTimezone: true }), pdfReference: text("pdf_reference"), ...timestamps }, (table) => [uniqueIndex("invoices_number_unique").on(table.number), index("invoices_org_status_idx").on(table.organizationId, table.status), check("invoices_nonnegative", sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.totalMinor} >= 0 AND ${table.amountPaidMinor} >= 0`)]);
export const invoiceLines = pgTable("invoice_lines", { id: text().primaryKey(), invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }), type: text().notNull(), description: text().notNull(), quantity: bigint({ mode: "bigint" }).notNull(), unitAmountMinor: bigint("unit_amount_minor", { mode: "bigint" }).notNull(), subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(), taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(sql`0`), totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(), sourceType: text("source_type").notNull(), sourceId: text("source_id").notNull(), metadata: jsonb().notNull().default({}) }, (table) => [index("invoice_lines_invoice_idx").on(table.invoiceId), uniqueIndex("invoice_lines_source_unique").on(table.invoiceId, table.sourceType, table.sourceId)]);

export const taxProfiles = pgTable("tax_profiles", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }).unique(), country: text().notNull(), region: text(), taxId: text("tax_id"), taxExempt: boolean("tax_exempt").notNull().default(false), reverseChargeEligible: boolean("reverse_charge_eligible").notNull().default(false), evidence: jsonb().notNull().default({}), ...timestamps });
export const taxRates = pgTable("tax_rates", { id: text().primaryKey(), country: text().notNull(), region: text(), category: text().notNull(), rateBasisPoints: integer("rate_basis_points").notNull(), version: integer().notNull(), effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effective_until", { withTimezone: true }), source: text().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("tax_rates_version_scope_unique").on(table.country, table.region, table.category, table.version), check("tax_rates_range", sql`${table.rateBasisPoints} >= 0 AND ${table.rateBasisPoints} <= 10000`)]);
export const exchangeRates = pgTable("exchange_rates", { id: text().primaryKey(), baseCurrency: text("base_currency").notNull(), quoteCurrency: text("quote_currency").notNull(), numerator: bigint({ mode: "bigint" }).notNull(), denominator: bigint({ mode: "bigint" }).notNull(), source: text().notNull(), observedAt: timestamp("observed_at", { withTimezone: true }).notNull(), validUntil: timestamp("valid_until", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("exchange_rates_observation_unique").on(table.baseCurrency, table.quoteCurrency, table.source, table.observedAt), check("exchange_rates_positive", sql`${table.numerator} > 0 AND ${table.denominator} > 0`)]);

export const ledgerAccounts = pgTable("ledger_accounts", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }), code: text().notNull(), name: text().notNull(), type: text().notNull(), currency: text().notNull(), status: text().notNull().default("active"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("ledger_accounts_scope_code_unique").on(table.organizationId, table.code)]);
export const ledgerTransactions = pgTable("ledger_transactions", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }), type: text().notNull(), referenceType: text("reference_type").notNull(), referenceId: text("reference_id").notNull(), idempotencyKey: text("idempotency_key").notNull(), reversalOfId: text("reversal_of_id"), description: text().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("ledger_transactions_idempotency_unique").on(table.idempotencyKey), uniqueIndex("ledger_transactions_reference_unique").on(table.type, table.referenceType, table.referenceId)]);
export const ledgerEntries = pgTable("ledger_entries", { id: text().primaryKey(), transactionId: text("transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }), accountId: text("account_id").notNull().references(() => ledgerAccounts.id, { onDelete: "restrict" }), direction: text().notNull(), amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(), currency: text().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("ledger_entries_transaction_idx").on(table.transactionId), index("ledger_entries_account_idx").on(table.accountId), check("ledger_entries_positive", sql`${table.amountMinor} > 0`), check("ledger_entries_direction", sql`${table.direction} IN ('debit', 'credit')`)]);

export const usageSettlements = pgTable("usage_settlements", { id: text().primaryKey(), requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }), usageRecordId: text("usage_record_id").notNull().references(() => usageRecords.id, { onDelete: "restrict" }), reservationId: text("reservation_id").notNull().references(() => creditReservations.id, { onDelete: "restrict" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), providerCostMinor: bigint("provider_cost_minor", { mode: "bigint" }).notNull(), customerChargeMinor: bigint("customer_charge_minor", { mode: "bigint" }).notNull(), creditsConsumed: bigint("credits_consumed", { mode: "bigint" }).notNull(), currency: text().notNull(), pricingVersion: integer("pricing_version").notNull(), conversionVersion: integer("conversion_version").notNull(), ledgerTransactionId: text("ledger_transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }), status: text().notNull(), settledAt: timestamp("settled_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("usage_settlements_request_unique").on(table.requestId), uniqueIndex("usage_settlements_usage_unique").on(table.usageRecordId), check("usage_settlements_nonnegative", sql`${table.providerCostMinor} >= 0 AND ${table.customerChargeMinor} >= 0 AND ${table.creditsConsumed} >= 0`)]);
export const providerPriceSchedules = pgTable("provider_price_schedules", {
  id: text().primaryKey(),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }),
  providerRouteId: text("provider_route_id").references(() => modelProviderRoutes.id, { onDelete: "cascade" }),
  canonicalModelId: text("canonical_model_id").references(() => canonicalModels.id, { onDelete: "cascade" }),
  providerModelId: text("provider_model_id"),
  region: text().notNull().default("global"),
  credentialId: text("credential_id").references(() => providerCredentials.id, { onDelete: "cascade" }),
  currency: text().notNull().default("USD"),
  status: text().notNull().default("active"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  source: text().notNull().default("contract"),
  sourceReference: text("source_reference"),
  version: integer().notNull().default(1),
  metadata: jsonb().notNull().default({}),
  ...timestamps,
}, (table) => [
  index("provider_price_schedules_provider_idx").on(table.providerId, table.status),
  index("provider_price_schedules_effective_idx").on(table.effectiveFrom, table.effectiveTo),
]);

export const providerRates = pgTable("provider_rates", {
  id: text().primaryKey(),
  scheduleId: text("schedule_id").notNull().references(() => providerPriceSchedules.id, { onDelete: "cascade" }),
  usageType: text("usage_type").notNull(),
  unit: text().notNull().default("token"),
  price: text().notNull(),
  perUnits: bigint("per_units", { mode: "bigint" }).notNull().default(sql`1000000`),
  minimumCharge: text("minimum_charge"),
  tierStart: bigint("tier_start", { mode: "bigint" }),
  tierEnd: bigint("tier_end", { mode: "bigint" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("provider_rates_schedule_idx").on(table.scheduleId),
  index("provider_rates_type_idx").on(table.scheduleId, table.usageType),
]);

export const providerCostRecords = pgTable("provider_cost_records", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  currency: text().notNull().default("USD"),
  subtotal: text().notNull().default("0"),
  costStatus: text("cost_status").notNull().default("exact"),
  priceVersionSet: jsonb("price_version_set").notNull().default(sql`'[]'::jsonb`),
  attemptCount: integer("attempt_count").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("provider_cost_records_request_unique").on(table.requestId),
  index("provider_cost_records_tenant_idx").on(table.organizationId, table.workspaceId, table.createdAt),
]);

export const providerCostLines = pgTable("provider_cost_lines", {
  id: text().primaryKey(),
  costRecordId: text("cost_record_id").notNull().references(() => providerCostRecords.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
  attemptId: text("attempt_id").references(() => providerAttempts.id, { onDelete: "set null" }),
  usageEventId: text("usage_event_id"),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "restrict" }),
  providerRouteId: text("provider_route_id"),
  canonicalModelId: text("canonical_model_id").notNull(),
  usageType: text("usage_type").notNull(),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  unit: text().notNull().default("token"),
  priceScheduleId: text("price_schedule_id").notNull().references(() => providerPriceSchedules.id, { onDelete: "restrict" }),
  priceVersion: integer("price_version").notNull().default(1),
  rate: text().notNull(),
  perUnits: bigint("per_units", { mode: "bigint" }).notNull(),
  amount: text().notNull(),
  currency: text().notNull().default("USD"),
  source: text().notNull().default("contract"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("provider_cost_lines_record_idx").on(table.costRecordId),
  index("provider_cost_lines_request_idx").on(table.requestId),
]);

export const customerPricingPolicies = pgTable("customer_pricing_policies", {
  id: text().primaryKey(),
  scopeType: text("scope_type").notNull().default("global"),
  scopeId: text("scope_id"),
  currency: text().notNull().default("USD"),
  status: text().notNull().default("active"),
  version: integer().notNull().default(1),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  pricingModel: text("pricing_model").notNull().default("fixed_model_rate"),
  cachePricingMode: text("cache_pricing_mode").notNull().default("discount_percentage"),
  cacheDiscountPercentage: text("cache_discount_percentage"),
  retryOverheadPolicy: text("retry_overhead_policy").notNull().default("absorbed_by_growx"),
  markupBasisPoints: bigint("markup_basis_points", { mode: "bigint" }),
  markupMultiplier: text("markup_multiplier"),
  fixedFee: text("fixed_fee"),
  minimumMarginBasisPoints: bigint("minimum_margin_basis_points", { mode: "bigint" }),
  ...timestamps,
}, (table) => [
  index("customer_pricing_policies_scope_idx").on(table.scopeType, table.scopeId, table.status),
]);

export const customerRateSchedules = pgTable("customer_rate_schedules", {
  id: text().primaryKey(),
  pricingPolicyId: text("pricing_policy_id").notNull().references(() => customerPricingPolicies.id, { onDelete: "cascade" }),
  canonicalModelId: text("canonical_model_id").references(() => canonicalModels.id, { onDelete: "cascade" }),
  operation: text(),
  currency: text().notNull().default("USD"),
  version: integer().notNull().default(1),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("customer_rate_schedules_policy_idx").on(table.pricingPolicyId),
  index("customer_rate_schedules_model_idx").on(table.pricingPolicyId, table.canonicalModelId),
]);

export const customerRates = pgTable("customer_rates", {
  id: text().primaryKey(),
  scheduleId: text("schedule_id").notNull().references(() => customerRateSchedules.id, { onDelete: "cascade" }),
  usageType: text("usage_type").notNull(),
  unit: text().notNull().default("token"),
  price: text().notNull(),
  perUnits: bigint("per_units", { mode: "bigint" }).notNull().default(sql`1000000`),
  minimumCharge: text("minimum_charge"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("customer_rates_schedule_idx").on(table.scheduleId),
]);

export const customerPriceRecords = pgTable("customer_price_records", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  pricingPolicyId: text("pricing_policy_id").notNull().references(() => customerPricingPolicies.id, { onDelete: "restrict" }),
  pricingPolicyVersion: integer("pricing_policy_version").notNull().default(1),
  currency: text().notNull().default("USD"),
  subtotal: text().notNull().default("0"),
  pricingStatus: text("pricing_status").notNull().default("final"),
  executionSource: text("execution_source").notNull().default("live_provider"),
  ...timestamps,
}, (table) => [
  uniqueIndex("customer_price_records_request_unique").on(table.requestId),
  index("customer_price_records_tenant_idx").on(table.organizationId, table.workspaceId, table.createdAt),
]);

export const customerPriceLines = pgTable("customer_price_lines", {
  id: text().primaryKey(),
  priceRecordId: text("price_record_id").notNull().references(() => customerPriceRecords.id, { onDelete: "cascade" }),
  usageType: text("usage_type").notNull(),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  unit: text().notNull().default("token"),
  rate: text().notNull(),
  perUnits: bigint("per_units", { mode: "bigint" }).notNull(),
  amount: text().notNull(),
  ruleType: text("rule_type").notNull().default("fixed_model_rate"),
  sourceUsageEventId: text("source_usage_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("customer_price_lines_record_idx").on(table.priceRecordId),
]);

export const pricingAdjustments = pgTable("pricing_adjustments", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetRecordId: text("target_record_id").notNull(),
  targetLineId: text("target_line_id"),
  usageReconciliationId: text("usage_reconciliation_id"),
  previousAmount: text("previous_amount").notNull(),
  newAmount: text("new_amount").notNull(),
  differenceAmount: text("difference_amount").notNull(),
  currency: text().notNull().default("USD"),
  reason: text().notNull(),
  operatorId: text("operator_id").notNull(),
  appliedPriceScheduleId: text("applied_price_schedule_id"),
  appliedPriceVersion: integer("applied_price_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pricing_adjustments_request_idx").on(table.requestId),
  index("pricing_adjustments_tenant_idx").on(table.organizationId, table.workspaceId, table.createdAt),
]);
export const reconciliationRuns = pgTable("reconciliation_runs", { id: text().primaryKey(), domain: text().notNull(), periodStart: timestamp("period_start", { withTimezone: true }).notNull(), periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), status: text().notNull(), examined: integer().notNull().default(0), mismatches: integer().notNull().default(0), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("reconciliation_runs_domain_period_idx").on(table.domain, table.periodStart, table.periodEnd)]);
export const reconciliationItems = pgTable("reconciliation_items", { id: text().primaryKey(), runId: text("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "restrict" }), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }), type: text().notNull(), severity: text().notNull(), referenceType: text("reference_type").notNull(), referenceId: text("reference_id").notNull(), expected: jsonb().notNull(), actual: jsonb().notNull(), status: text().notNull().default("open"), resolution: text(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("reconciliation_items_run_status_idx").on(table.runId, table.status)]);

export const webhookEndpoints = pgTable("webhook_endpoints", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), url: text().notNull(), description: text().notNull().default(""), status: text().notNull().default("active"), secretEncrypted: text("secret_encrypted").notNull(), secretVersion: integer("secret_version").notNull().default(1), ...timestamps }, (table) => [index("webhook_endpoints_scope_idx").on(table.organizationId, table.workspaceId, table.status)]);
export const webhookSubscriptions = pgTable("webhook_subscriptions", { webhookEndpointId: text("webhook_endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }), eventType: text("event_type").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [primaryKey({ columns: [table.webhookEndpointId, table.eventType] })]);
export const webhookDeliveries = pgTable("webhook_deliveries", { id: text().primaryKey(), webhookEndpointId: text("webhook_endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "restrict" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }), eventId: text("event_id").notNull(), eventType: text("event_type").notNull(), payload: jsonb().notNull(), status: text().notNull(), attemptCount: integer("attempt_count").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }), deliveredAt: timestamp("delivered_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("webhook_delivery_endpoint_event_unique").on(table.webhookEndpointId, table.eventId), index("webhook_delivery_queue_idx").on(table.status, table.nextAttemptAt), index("webhook_delivery_scope_idx").on(table.organizationId, table.workspaceId, table.createdAt)]);
export const webhookDeliveryAttempts = pgTable("webhook_delivery_attempts", { id: text().primaryKey(), deliveryId: text("delivery_id").notNull().references(() => webhookDeliveries.id, { onDelete: "restrict" }), attempt: integer().notNull(), requestHeaders: jsonb("request_headers").notNull(), responseStatus: integer("response_status"), responseBodyRedacted: text("response_body_redacted"), latencyMs: integer("latency_ms"), failureCode: text("failure_code"), attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull() }, (table) => [uniqueIndex("webhook_attempt_unique").on(table.deliveryId, table.attempt)]);

export const notifications = pgTable("notifications", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), category: text().notNull(), title: text().notNull(), body: text().notNull(), resourceType: text("resource_type"), resourceId: text("resource_id"), readAt: timestamp("read_at", { withTimezone: true }), archivedAt: timestamp("archived_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("notifications_user_state_idx").on(table.userId, table.readAt, table.createdAt)]);
export const notificationPreferences = pgTable("notification_preferences", { userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), category: text().notNull(), inApp: boolean("in_app").notNull().default(true), email: boolean().notNull().default(true), webhook: boolean().notNull().default(false), ...timestamps }, (table) => [primaryKey({ columns: [table.userId, table.organizationId, table.category] })]);
export const alertRules = pgTable("alert_rules", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }), metric: text().notNull(), operator: text().notNull(), threshold: bigint({ mode: "bigint" }).notNull(), period: text().notNull(), channels: jsonb().notNull(), status: text().notNull().default("active"), ...timestamps }, (table) => [index("alert_rules_scope_idx").on(table.organizationId, table.workspaceId, table.status)]);

export const serviceAccounts = pgTable("service_accounts", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), name: text().notNull(), description: text().notNull().default(""), status: text().notNull().default("active"), createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }), ...timestamps }, (table) => [uniqueIndex("service_accounts_scope_name_unique").on(table.organizationId, table.workspaceId, table.name)]);
export const serviceAccountCredentials = pgTable("service_account_credentials", { id: text().primaryKey(), serviceAccountId: text("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "cascade" }), prefix: text().notNull(), secretHash: text("secret_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("service_account_credentials_prefix_unique").on(table.prefix), index("service_account_credentials_account_idx").on(table.serviceAccountId)]);

export const exportJobs = pgTable("exports", { id: text().primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "restrict" }), requestedBy: text("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }), type: text().notNull(), format: text().notNull(), filters: jsonb().notNull(), status: text().notNull(), storageReference: text("storage_reference"), rowCount: integer("row_count"), expiresAt: timestamp("expires_at", { withTimezone: true }), failureCode: text("failure_code"), ...timestamps }, (table) => [index("exports_scope_status_idx").on(table.organizationId, table.workspaceId, table.status), check("exports_format", sql`${table.format} IN ('csv', 'json')`)]);
export const developerOnboarding = pgTable("developer_onboarding", { organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), firstApiKeyAt: timestamp("first_api_key_at", { withTimezone: true }), firstGatewayRequestAt: timestamp("first_gateway_request_at", { withTimezone: true }), firstSuccessfulRequestAt: timestamp("first_successful_request_at", { withTimezone: true }), firstPlaygroundRequestAt: timestamp("first_playground_request_at", { withTimezone: true }), billingConfiguredAt: timestamp("billing_configured_at", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [primaryKey({ columns: [table.organizationId, table.workspaceId] })]);
export const userPreferences = pgTable("user_preferences", { userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }), preferredOrganizationId: text("preferred_organization_id").references(() => organizations.id, { onDelete: "set null" }), preferredWorkspaceId: text("preferred_workspace_id").references(() => workspaces.id, { onDelete: "set null" }), preferredEnvironmentId: text("preferred_environment_id").references(() => environments.id, { onDelete: "set null" }), theme: text().notNull().default("system"), timezone: text().notNull().default("UTC"), locale: text().notNull().default("en"), defaultPlaygroundModel: text("default_playground_model"), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });

export const incidents = pgTable("incidents", { id: text().primaryKey(), title: text().notNull(), status: text().notNull(), severity: text().notNull(), impact: text().notNull(), components: jsonb().notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), resolvedAt: timestamp("resolved_at", { withTimezone: true }), createdBy: text("created_by").notNull(), ...timestamps }, (table) => [index("incidents_status_started_idx").on(table.status, table.startedAt)]);
export const incidentUpdates = pgTable("incident_updates", { id: text().primaryKey(), incidentId: text("incident_id").notNull().references(() => incidents.id, { onDelete: "restrict" }), status: text().notNull(), message: text().notNull(), createdBy: text("created_by").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("incident_updates_incident_time_idx").on(table.incidentId, table.createdAt)]);

export const privilegedSessions = pgTable("privileged_sessions", { id: text().primaryKey(), operatorId: text("operator_id").notNull(), authenticationStrength: text("authentication_strength").notNull(), reason: text().notNull(), approvalReference: text("approval_reference"), scope: jsonb().notNull(), breakGlass: boolean("break_glass").notNull().default(false), authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("privileged_sessions_operator_expiry_idx").on(table.operatorId, table.expiresAt)]);
export const privilegedSessionCapabilities = pgTable("privileged_session_capabilities", { sessionId: text("session_id").notNull().references(() => privilegedSessions.id, { onDelete: "cascade" }), capability: text().notNull() }, (table) => [primaryKey({ columns: [table.sessionId, table.capability] })]);
export const privilegedAuditEvents = pgTable("privileged_audit_events", { id: text().primaryKey(), sessionId: text("session_id").notNull().references(() => privilegedSessions.id, { onDelete: "restrict" }), operatorId: text("operator_id").notNull(), action: text().notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), organizationId: text("organization_id"), workspaceId: text("workspace_id"), reason: text().notNull(), approvalReference: text("approval_reference"), requestId: text("request_id").notNull(), result: text().notNull(), metadata: jsonb().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("privileged_audit_operator_time_idx").on(table.operatorId, table.createdAt), index("privileged_audit_resource_idx").on(table.resourceType, table.resourceId)]);

export const roles = pgTable("roles", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }), key: text().notNull(), name: text().notNull(), builtIn: boolean("built_in").notNull().default(false), ...timestamps }, (table) => [uniqueIndex("roles_org_key_unique").on(table.organizationId, table.key)]);
export const permissions = pgTable("permissions", { id: text().primaryKey(), key: text().notNull().unique(), description: text().notNull(), scope: text().notNull() });
export const rolePermissions = pgTable("role_permissions", { roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }), permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }) }, (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]);
export const memberRoles = pgTable("member_roles", { organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), memberId: text("member_id").notNull().references(() => organizationMembers.id, { onDelete: "cascade" }), roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }), assignedBy: text("assigned_by").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [primaryKey({ columns: [table.memberId, table.roleId] }), index("member_roles_org_idx").on(table.organizationId)]);

export const auditEvents = pgTable("audit_events", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "restrict" }), actorType: actorType("actor_type").notNull(), actorId: text("actor_id").notNull(), action: text().notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), requestId: text("request_id").notNull(), traceId: text("trace_id"), ipAddress: text("ip_address"), userAgent: text("user_agent"), metadata: jsonb().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("audit_events_org_created_idx").on(table.organizationId, table.createdAt), index("audit_events_workspace_idx").on(table.workspaceId)]);
export const securityEvents = pgTable("security_events", { id: text().primaryKey(), organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }), userId: text("user_id").references(() => users.id, { onDelete: "restrict" }), type: text().notNull(), severity: text().notNull(), requestId: text("request_id").notNull(), metadata: jsonb().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("security_events_user_created_idx").on(table.userId, table.createdAt)]);
export const outbox = pgTable("outbox", { id: text().primaryKey(), topic: text().notNull(), organizationId: text("organization_id"), workspaceId: text("workspace_id"), payload: jsonb().notNull(), attempts: integer().notNull().default(0), publishedAt: timestamp("published_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [index("outbox_unpublished_idx").on(table.publishedAt, table.createdAt)]);

// ==========================================
// Phase 17: Credits + Wallet + Billing Engine
// ==========================================

export const walletBalances = pgTable("wallet_balances", {
  walletId: text("wallet_id").primaryKey().references(() => creditWallets.id, { onDelete: "cascade" }),
  available: numeric("available", { precision: 36, scale: 18 }).notNull().default("0"),
  reserved: numeric("reserved", { precision: 36, scale: 18 }).notNull().default("0"),
  total: numeric("total", { precision: 36, scale: 18 }).notNull().default("0"),
  version: integer().notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletLedgerEntries = pgTable("wallet_ledger_entries", {
  id: text().primaryKey(),
  walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  currency: text().notNull().default("USD"),
  sequence: bigint("sequence", { mode: "bigint" }).notNull(),
  entryType: text("entry_type").notNull(),
  amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
  direction: text().notNull(),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id").notNull(),
  idempotencyKey: text("idempotency_key"),
  balanceAfter: jsonb("balance_after"),
  metadata: jsonb().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("wallet_ledger_wallet_sequence_unique").on(table.walletId, table.sequence),
  index("wallet_ledger_wallet_time_idx").on(table.walletId, table.createdAt),
  index("wallet_ledger_reference_idx").on(table.referenceType, table.referenceId),
]);

export const creditLots = pgTable("credit_lots", {
  id: text().primaryKey(),
  walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  lotType: text("lot_type").notNull(),
  currency: text().notNull().default("USD"),
  originalAmount: numeric("original_amount", { precision: 36, scale: 18 }).notNull(),
  remainingAmount: numeric("remaining_amount", { precision: 36, scale: 18 }).notNull(),
  reservedAmount: numeric("reserved_amount", { precision: 36, scale: 18 }).notNull().default("0"),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("credit_lots_wallet_expiry_idx").on(table.walletId, table.expiresAt),
  index("credit_lots_org_type_idx").on(table.organizationId, table.lotType),
]);

export const reservationAllocations = pgTable("reservation_allocations", {
  id: text().primaryKey(),
  reservationId: text("reservation_id").notNull(),
  creditLotId: text("credit_lot_id").notNull().references(() => creditLots.id, { onDelete: "restrict" }),
  allocatedAmount: numeric("allocated_amount", { precision: 36, scale: 18 }).notNull(),
  consumedAmount: numeric("consumed_amount", { precision: 36, scale: 18 }),
  releasedAmount: numeric("released_amount", { precision: 36, scale: 18 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("reservation_allocations_res_idx").on(table.reservationId),
]);

export const workspaceBudgets = pgTable("workspace_budgets", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  currency: text().notNull().default("USD"),
  period: text().notNull().default("monthly"),
  hardLimit: numeric("hard_limit", { precision: 36, scale: 18 }).notNull(),
  warningThreshold: numeric("warning_threshold", { precision: 36, scale: 18 }),
  spentInPeriod: numeric("spent_in_period", { precision: 36, scale: 18 }).notNull().default("0"),
  reservedInPeriod: numeric("reserved_in_period", { precision: 36, scale: 18 }).notNull().default("0"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  enabled: boolean().notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("workspace_budgets_unique").on(table.workspaceId, table.period),
  index("workspace_budgets_org_idx").on(table.organizationId),
]);

export const billingAuthorizationRecords = pgTable("billing_authorization_records", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().unique(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  walletId: text("wallet_id"),
  reservationId: text("reservation_id"),
  decision: text().notNull(),
  reason: text(),
  estimatedPrice: numeric("estimated_price", { precision: 36, scale: 18 }).notNull(),
  requiredReservation: numeric("required_reservation", { precision: 36, scale: 18 }).notNull(),
  availableAtDecision: numeric("available_at_decision", { precision: 36, scale: 18 }),
  currency: text().notNull().default("USD"),
  pricingPolicyVersion: text("pricing_policy_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("billing_auth_records_org_ws_idx").on(table.organizationId, table.workspaceId, table.createdAt),
]);

export const settlementShortfalls = pgTable("settlement_shortfalls", {
  id: text().primaryKey(),
  walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
  reservationId: text("reservation_id").notNull(),
  requestId: text("request_id").notNull(),
  currency: text().notNull().default("USD"),
  reservedAmount: numeric("reserved_amount", { precision: 36, scale: 18 }).notNull(),
  finalCustomerPrice: numeric("final_customer_price", { precision: 36, scale: 18 }).notNull(),
  shortfallAmount: numeric("shortfall_amount", { precision: 36, scale: 18 }).notNull(),
  status: text().notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  index("settlement_shortfalls_org_status_idx").on(table.organizationId, table.status),
]);

export const walletAdjustmentLogs = pgTable("wallet_adjustment_logs", {
  id: text().primaryKey(),
  walletId: text("wallet_id").notNull().references(() => creditWallets.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
  direction: text().notNull(),
  currency: text().notNull().default("USD"),
  reason: text().notNull(),
  reference: text().notNull(),
  createdBy: text("created_by").notNull(),
  jitGrantId: text("jit_grant_id"),
  ledgerEntryId: text("ledger_entry_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wallet_adjustments_org_idx").on(table.organizationId, table.createdAt),
]);

// ─── Phase 18: Subscription Plans + Entitlements ─────────────

export const plans = pgTable("plans", {
  id: text().primaryKey(),
  slug: text().notNull(),
  displayName: text("display_name").notNull(),
  description: text(),
  isPublic: boolean("is_public").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text().notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("plans_slug_unique").on(table.slug),
  index("plans_status_idx").on(table.status),
]);

export const planVersions = pgTable("plan_versions", {
  id: text().primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  version: integer().notNull(),
  status: planVersionStatus().notNull().default("draft"),
  billingInterval: text("billing_interval").notNull(),
  basePriceAmount: numeric("base_price_amount", { precision: 36, scale: 18 }).notNull().default("0"),
  currency: text().notNull().default("USD"),
  creditGrantAmount: numeric("credit_grant_amount", { precision: 36, scale: 18 }).notNull().default("0"),
  featureFlags: jsonb("feature_flags").notNull().default([]),
  commercialTerms: jsonb("commercial_terms").notNull().default({}),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("plan_versions_plan_version_unique").on(table.planId, table.version),
  index("plan_versions_plan_idx").on(table.planId),
  index("plan_versions_status_idx").on(table.status),
]);

export const planEntitlements = pgTable("plan_entitlements", {
  id: text().primaryKey(),
  planVersionId: text("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "cascade" }),
  key: text().notNull(),
  type: entitlementType().notNull(),
  value: text().notNull(),
  description: text(),
}, (table) => [
  uniqueIndex("plan_entitlements_version_key_unique").on(table.planVersionId, table.key),
]);

export const planModelAccessRules = pgTable("plan_model_access_rules", {
  id: text().primaryKey(),
  planVersionId: text("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "cascade" }),
  pattern: text().notNull(),
  effect: policyEffect().notNull(),
  maxTokensPerRequest: integer("max_tokens_per_request"),
  rateLimitOverride: jsonb("rate_limit_override"),
}, (table) => [
  index("plan_model_access_rules_version_idx").on(table.planVersionId),
]);

export const planLimits = pgTable("plan_limits", {
  id: text().primaryKey(),
  planVersionId: text("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "cascade" }),
  key: text().notNull(),
  value: integer().notNull(),
  window: text(),
}, (table) => [
  uniqueIndex("plan_limits_version_key_unique").on(table.planVersionId, table.key),
]);

export const organizationSubscriptions = pgTable("organization_subscriptions", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  planVersionId: text("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  status: subscriptionStatus().notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  fundingMode: subscriptionFundingMode("funding_mode").notNull().default("manual"),
  metadata: jsonb().notNull().default({}),
  ...timestamps,
}, (table) => [
  index("org_subscriptions_org_status_idx").on(table.organizationId, table.status),
  index("org_subscriptions_renewal_idx").on(table.currentPeriodEnd, table.status),
]);

export const subscriptionPeriods = pgTable("subscription_periods", {
  id: text().primaryKey(),
  subscriptionId: text("subscription_id").notNull().references(() => organizationSubscriptions.id, { onDelete: "restrict" }),
  periodNumber: integer("period_number").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  creditGrantId: text("credit_grant_id"),
  status: subscriptionPeriodStatus().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("subscription_periods_sub_number_unique").on(table.subscriptionId, table.periodNumber),
]);

export const entitlementOverrides = pgTable("entitlement_overrides", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  key: text().notNull(),
  type: entitlementType().notNull(),
  value: text().notNull(),
  reason: text().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("entitlement_overrides_org_key_unique").on(table.organizationId, table.key),
]);

export const legalEntities = pgTable("legal_entities", {
  id: text().primaryKey(),
  code: text().notNull().unique(),
  legalName: text("legal_name").notNull(),
  country: text().notNull(),
  stateRegion: text("state_region"),
  registeredAddress: jsonb("registered_address").notNull(),
  taxIdentifiers: jsonb("tax_identifiers").notNull().default([]),
  invoicePrefix: text("invoice_prefix"),
  status: text().notNull().default("active"),
  ...timestamps,
});

export const customerBillingProfiles = pgTable("customer_billing_profiles", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  legalName: text("legal_name").notNull(),
  billingEmail: text("billing_email"),
  country: text().notNull(),
  stateRegion: text("state_region"),
  postalCode: text("postal_code"),
  city: text(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  taxIdentifiers: jsonb("tax_identifiers").notNull().default([]),
  billingCurrency: text("billing_currency").notNull().default("USD"),
  taxExemptionStatus: text("tax_exemption_status").notNull().default("none"),
  ...timestamps,
}, (table) => [
  index("customer_billing_profiles_org_idx").on(table.organizationId),
]);

export const invoiceLegalEntitySnapshots = pgTable("invoice_legal_entity_snapshots", {
  id: text().primaryKey(),
  legalEntityId: text("legal_entity_id").notNull(),
  code: text().notNull(),
  legalName: text("legal_name").notNull(),
  country: text().notNull(),
  stateRegion: text("state_region"),
  registeredAddress: jsonb("registered_address").notNull(),
  taxIdentifiers: jsonb("tax_identifiers").notNull().default([]),
  invoicePrefix: text("invoice_prefix"),
  snapshottedAt: timestamp("snapshotted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceBillingProfileSnapshots = pgTable("invoice_billing_profile_snapshots", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull(),
  legalName: text("legal_name").notNull(),
  billingEmail: text("billing_email"),
  country: text().notNull(),
  stateRegion: text("state_region"),
  postalCode: text("postal_code"),
  city: text(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  taxIdentifiers: jsonb("tax_identifiers").notNull().default([]),
  taxExemptionStatus: text("tax_exemption_status"),
  snapshottedAt: timestamp("snapshotted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxRules = pgTable("tax_rules", {
  id: text().primaryKey(),
  regime: taxRegime().notNull(),
  jurisdiction: text().notNull(),
  supplyType: text("supply_type"),
  customerType: text("customer_type"),
  productTaxCode: text("product_tax_code"),
  taxType: text("tax_type").notNull(),
  rate: numeric({ precision: 36, scale: 18 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  status: text().notNull().default("active"),
  version: integer().notNull().default(1),
  description: text(),
  ...timestamps,
}, (table) => [
  index("tax_rules_regime_jurisdiction_idx").on(table.regime, table.jurisdiction, table.status),
]);

export const invoiceSequences = pgTable("invoice_sequences", {
  id: text().primaryKey(),
  legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id, { onDelete: "restrict" }),
  fiscalYear: text("fiscal_year").notNull(),
  nextSequence: bigint("next_sequence", { mode: "bigint" }).notNull().default(sql`1`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("invoice_sequences_entity_fy_unique").on(table.legalEntityId, table.fiscalYear),
]);

export const invoiceTaxLines = pgTable("invoice_tax_lines", {
  id: text().primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  taxType: text("tax_type").notNull(),
  rate: numeric({ precision: 36, scale: 18 }).notNull(),
  taxableAmount: numeric("taxable_amount", { precision: 36, scale: 18 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 36, scale: 18 }).notNull(),
  jurisdiction: text().notNull(),
  ruleId: text("rule_id"),
  description: text().notNull(),
  sacHsnCode: text("sac_hsn_code"),
}, (table) => [
  index("invoice_tax_lines_invoice_idx").on(table.invoiceId),
]);

export const invoicePaymentAllocations = pgTable("invoice_payment_allocations", {
  id: text().primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  amount: numeric({ precision: 36, scale: 18 }).notNull(),
  currency: text().notNull(),
  allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
  idempotencyKey: text("idempotency_key").notNull(),
}, (table) => [
  uniqueIndex("invoice_payment_allocations_inv_pay_unique").on(table.invoiceId, table.paymentId),
  uniqueIndex("invoice_payment_allocations_idempotency_unique").on(table.idempotencyKey),
]);

export const creditNotes = pgTable("credit_notes", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id, { onDelete: "restrict" }),
  creditNoteNumber: text("credit_note_number").notNull().unique(),
  originalInvoiceId: text("original_invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  status: creditNoteStatus().notNull().default("issued"),
  currency: text().notNull(),
  subtotal: numeric({ precision: 36, scale: 18 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 36, scale: 18 }).notNull().default("0"),
  total: numeric({ precision: 36, scale: 18 }).notNull(),
  amountAllocated: numeric("amount_allocated", { precision: 36, scale: 18 }).notNull().default("0"),
  reason: text().notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => [
  index("credit_notes_org_status_idx").on(table.organizationId, table.status),
  index("credit_notes_original_invoice_idx").on(table.originalInvoiceId),
]);

export const creditNoteLines = pgTable("credit_note_lines", {
  id: text().primaryKey(),
  creditNoteId: text("credit_note_id").notNull().references(() => creditNotes.id, { onDelete: "restrict" }),
  lineNumber: integer("line_number").notNull(),
  description: text().notNull(),
  quantity: bigint({ mode: "bigint" }).notNull().default(sql`1`),
  unitPrice: numeric("unit_price", { precision: 36, scale: 18 }).notNull(),
  subtotal: numeric({ precision: 36, scale: 18 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 36, scale: 18 }).notNull().default("0"),
  total: numeric({ precision: 36, scale: 18 }).notNull(),
}, (table) => [
  index("credit_note_lines_credit_note_idx").on(table.creditNoteId),
]);

export const invoiceDocuments = pgTable("invoice_documents", {
  id: text().primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  version: integer().notNull().default(1),
  templateVersion: text("template_version").notNull(),
  format: text().notNull().default("html"),
  storageKey: text("storage_key").notNull(),
  sha256Hash: text("sha256_hash").notNull(),
  byteSize: integer("byte_size").notNull(),
  status: text().notNull().default("generated"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("invoice_documents_invoice_version_unique").on(table.invoiceId, table.version),
  index("invoice_documents_invoice_idx").on(table.invoiceId),
]);

export const outboundWebhookEvents = pgTable("outbound_webhook_events", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  eventVersion: text("event_version").notNull().default("v1"),
  sourceEventId: text("source_event_id").notNull(),
  payload: jsonb().notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("outbound_events_source_unique").on(table.sourceEventId, table.eventType, table.eventVersion),
  index("outbound_events_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const webhookSigningSecrets = pgTable("webhook_signing_secrets", {
  id: text().primaryKey(),
  endpointId: text("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
  encryptedSecret: text("encrypted_secret").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  status: text().notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("webhook_secrets_endpoint_status_idx").on(table.endpointId, table.status),
]);

export const webhookReplayJobs = pgTable("webhook_replay_jobs", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  filterConfig: jsonb("filter_config").notNull().default({}),
  status: text().notNull().default("pending"),
  totalEvents: integer("total_events").notNull().default(0),
  replayedEvents: integer("replayed_events").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("webhook_replay_jobs_org_status_idx").on(table.organizationId, table.status),
]);

// ==========================================
// Phase 22: Security Operations + Audit Hardening
// ==========================================

export const auditChainHeads = pgTable("audit_chain_heads", {
  chainScope: text("chain_scope").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
  lastHash: text("last_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditIntegrityCheckpoints = pgTable("audit_integrity_checkpoints", {
  id: text().primaryKey(),
  chainScope: text("chain_scope").notNull(),
  lastSequence: integer("last_sequence").notNull(),
  lastEventHash: text("last_event_hash").notNull(),
  signedHash: text("signed_hash"),
  keyVersion: integer("key_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_checkpoints_scope_idx").on(table.chainScope, table.createdAt),
]);

export const securitySignals = pgTable("security_signals", {
  id: text().primaryKey(),
  fingerprint: text().notNull().unique(),
  type: text().notNull(),
  severity: text().notNull(),
  count: integer().notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  status: text().notNull().default("new"),
  lastSecurityEventId: text("last_security_event_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("security_signals_org_status_idx").on(table.organizationId, table.status),
  index("security_signals_severity_idx").on(table.severity, table.lastSeenAt),
]);

export const securityDetectionRules = pgTable("security_detection_rules", {
  id: text().primaryKey(),
  type: text().notNull().unique(),
  enabled: boolean().notNull().default(true),
  windowSeconds: integer("window_seconds").notNull(),
  threshold: integer().notNull(),
  severity: text().notNull(),
  cooldownSeconds: integer("cooldown_seconds").notNull(),
  scope: text().notNull().default("organization"),
  version: integer().notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const securityCases = pgTable("security_cases", {
  id: text().primaryKey(),
  title: text().notNull(),
  status: text().notNull().default("open"),
  severity: text().notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("security_cases_org_status_idx").on(table.organizationId, table.status),
]);

// ==========================================
// Phase 23: Notification + Incident Delivery Platform
// ==========================================

export const notificationIntents = pgTable("notification_intents", {
  id: text().primaryKey(),
  sourceEventId: text("source_event_id").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "restrict" }),
  category: text().notNull(),
  type: text().notNull(),
  priority: text().notNull(),
  preferenceMode: text("preference_mode").notNull(),
  templateKey: text("template_key").notNull(),
  templateVersion: integer("template_version").notNull().default(1),
  data: jsonb().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("notification_intents_source_type_unique").on(table.sourceEventId, table.type),
  index("notification_intents_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: text().primaryKey(),
  intentId: text("intent_id").notNull().references(() => notificationIntents.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id"),
  recipientSnapshot: text("recipient_snapshot").notNull(),
  channel: text().notNull(),
  status: text().notNull().default("pending"),
  priority: text().notNull().default("normal"),
  templateKey: text("template_key").notNull(),
  templateVersion: integer("template_version").notNull().default(1),
  provider: text(),
  providerMessageId: text("provider_message_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(4),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("notification_deliveries_status_attempt_idx").on(table.status, table.nextAttemptAt),
  index("notification_deliveries_priority_sched_idx").on(table.priority, table.scheduledAt),
  index("notification_deliveries_recipient_idx").on(table.recipientSnapshot, table.createdAt),
]);

export const notificationDeliveryAttempts = pgTable("notification_delivery_attempts", {
  id: text().primaryKey(),
  deliveryId: text("delivery_id").notNull().references(() => notificationDeliveries.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  provider: text().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  providerStatus: text("provider_status"),
  providerMessageId: text("provider_message_id"),
  errorCategory: text("error_category"),
  retryable: boolean().notNull().default(false),
  latencyMs: integer("latency_ms"),
}, (table) => [
  index("notification_attempts_delivery_idx").on(table.deliveryId, table.attemptNumber),
]);

export const notificationSuppressions = pgTable("notification_suppressions", {
  id: text().primaryKey(),
  destination: text().notNull().unique(),
  reason: text().notNull(),
  source: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const organizationNotificationSettings = pgTable("organization_notification_settings", {
  organizationId: text("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  securityAlertsEnabled: boolean("security_alerts_enabled").notNull().default(true),
  billingAlertsEnabled: boolean("billing_alerts_enabled").notNull().default(true),
  usageAlertsEnabled: boolean("usage_alerts_enabled").notNull().default(true),
  defaultTimezone: text("default_timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationEscalations = pgTable("notification_escalations", {
  id: text().primaryKey(),
  intentId: text("intent_id").notNull().references(() => notificationIntents.id, { onDelete: "cascade" }),
  signalId: text("signal_id"),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  escalationCount: integer("escalation_count").notNull().default(0),
  maxEscalations: integer("max_escalations").notNull().default(1),
  nextEscalationAt: timestamp("next_escalation_at", { withTimezone: true }).notNull(),
  status: text().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("notification_escalations_status_time_idx").on(table.status, table.nextEscalationAt),
]);

// ==========================================
// Phase 24: Semantic Cache & Request Optimization
// ==========================================

export const semanticCacheEntries = pgTable("semantic_cache_entries", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  namespaceHash: text("namespace_hash").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  semanticTextHash: text("semantic_text_hash").notNull(),
  embedding: jsonb().notNull(),
  embeddingModel: text("embedding_model").notNull(),
  embeddingDimensions: integer("embedding_dimensions").notNull(),
  canonicalModel: text("canonical_model").notNull(),
  modelCompatibilityGroup: text("model_compatibility_group"),
  systemPromptHash: text("system_prompt_hash").notNull(),
  policyVersion: integer("policy_version").notNull().default(1),
  cachePolicyVersion: integer("cache_policy_version").notNull().default(1),
  parametersHash: text("parameters_hash").notNull(),
  responseFormatHash: text("response_format_hash"),
  responsePayload: jsonb("response_payload").notNull(),
  responseHash: text("response_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  hitCount: integer("hit_count").notNull().default(0),
  status: text().notNull().default("active"),
}, (table) => [
  index("semantic_cache_org_ws_ns_idx").on(table.organizationId, table.workspaceId, table.namespaceHash),
  index("semantic_cache_expiry_status_idx").on(table.expiresAt, table.status),
]);

export const semanticCachePolicies = pgTable("semantic_cache_policies", {
  id: text().primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(true),
  similarityThreshold: text("similarity_threshold").notNull().default("0.8500"),
  ttlSeconds: integer("ttl_seconds").notNull().default(86400),
  maxEntrySizeBytes: integer("max_entry_size_bytes").notNull().default(524288),
  shadowMode: boolean("shadow_mode").notNull().default(false),
  allowedModels: jsonb("allowed_models").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const semanticEmbeddings = pgTable("semantic_embeddings", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  textHash: text("text_hash").notNull(),
  embedding: jsonb().notNull(),
  embeddingModel: text("embedding_model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("semantic_embeddings_org_hash_unique").on(table.organizationId, table.textHash),
]);

// ==========================================
// Phase 25: File & Object Storage Infrastructure
// ==========================================

export const files = pgTable("files", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  purpose: filePurpose().notNull(),
  status: fileStatus().notNull().default("pending_upload"),
  storageProvider: text("storage_provider").notNull().default("memory"),
  bucket: text(),
  storageKey: text("storage_key").notNull(),
  originalFileName: text("original_file_name").notNull(),
  safeFileName: text("safe_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  detectedMimeType: text("detected_mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull().default(sql`0`),
  checksumSha256: text("checksum_sha256"),
  etag: text(),
  encryptionState: text("encryption_state").notNull().default("provider_encrypted"),
  safetyState: fileSafetyState("safety_state").notNull().default("not_scanned"),
  metadata: jsonb().notNull().default({}),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("files_storage_key_unique").on(table.storageKey),
  index("files_org_created_idx").on(table.organizationId, table.createdAt),
  index("files_ws_created_idx").on(table.workspaceId, table.createdAt),
  index("files_status_expiry_idx").on(table.status, table.expiresAt),
  index("files_purpose_idx").on(table.purpose),
]);

export const fileUploadSessions = pgTable("file_upload_sessions", {
  id: text().primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: fileUploadSessionStatus().notNull().default("pending"),
  uploadType: fileUploadType("upload_type").notNull().default("single"),
  multipartUploadId: text("multipart_upload_id"),
  partCount: integer("part_count"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("file_upload_sessions_file_idx").on(table.fileId),
  index("file_upload_sessions_org_idx").on(table.organizationId),
  index("file_upload_sessions_expiry_status_idx").on(table.expiresAt, table.status),
]);

export const fileProviderReferences = pgTable("file_provider_references", {
  id: text().primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  providerCredentialId: text("provider_credential_id"),
  providerFileId: text("provider_file_id").notNull(),
  providerStatus: fileProviderReferenceStatus("provider_status").notNull().default("ready"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("file_provider_refs_file_idx").on(table.fileId),
  index("file_provider_refs_prov_file_idx").on(table.providerFileId),
  uniqueIndex("file_provider_refs_unique").on(table.fileId, table.providerId, table.providerCredentialId),
]);

export const fileUsageReferences = pgTable("file_usage_references", {
  id: text().primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("file_usage_refs_file_idx").on(table.fileId),
  index("file_usage_refs_type_id_idx").on(table.referenceType, table.referenceId),
]);

export const fileStorageReservations = pgTable("file_storage_reservations", {
  id: text().primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  reservedBytes: bigint("reserved_bytes", { mode: "bigint" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("file_storage_reservations_org_idx").on(table.organizationId),
  index("file_storage_reservations_expiry_idx").on(table.expiresAt),
]);

export const fileRetentionPolicies = pgTable("file_retention_policies", {
  id: text().primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  purpose: filePurpose().notNull(),
  retentionSeconds: integer("retention_seconds"),
  permanent: boolean().notNull().default(false),
  deletionMode: text("deletion_mode").notNull().default("soft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("file_retention_policies_org_purpose_idx").on(table.organizationId, table.purpose),
]);

// ==========================================
// Phase 26: Batch Inference + Async Job Execution Plane
// ==========================================

export const batchJobs = pgTable("batch_jobs", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByApiKeyId: text("created_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  inputFileId: text("input_file_id").references(() => files.id, { onDelete: "set null" }),
  outputFileId: text("output_file_id").references(() => files.id, { onDelete: "set null" }),
  errorFileId: text("error_file_id").references(() => files.id, { onDelete: "set null" }),
  endpoint: text().notNull().default("/v1/chat/completions"),
  status: batchJobStatus().notNull().default("validating"),
  completionWindow: text("completion_window").notNull().default("24h"),
  metadata: jsonb().notNull().default({}),
  totalItems: integer("total_items").notNull().default(0),
  pendingItems: integer("pending_items").notNull().default(0),
  runningItems: integer("running_items").notNull().default(0),
  succeededItems: integer("succeeded_items").notNull().default(0),
  failedItems: integer("failed_items").notNull().default(0),
  cancelledItems: integer("cancelled_items").notNull().default(0),
  errorSummary: jsonb("error_summary"),
  executionDeadlineAt: timestamp("execution_deadline_at", { withTimezone: true }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  queuedAt: timestamp("queued_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("batch_jobs_org_created_idx").on(table.organizationId, table.createdAt),
  index("batch_jobs_ws_created_idx").on(table.workspaceId, table.createdAt),
  index("batch_jobs_status_created_idx").on(table.status, table.createdAt),
  index("batch_jobs_status_deadline_idx").on(table.status, table.executionDeadlineAt),
]);

export const batchItems = pgTable("batch_items", {
  id: text().primaryKey(),
  batchId: text("batch_id").notNull().references(() => batchJobs.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customId: text("custom_id").notNull(),
  position: integer().notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  requestHash: text("request_hash"),
  status: batchItemStatus().notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  gatewayRequestId: text("gateway_request_id"),
  responsePayload: jsonb("response_payload"),
  responseReference: text("response_reference"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  errorCategory: text("error_category"),
  retryAfterAt: timestamp("retry_after_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("batch_items_batch_custom_id_unique").on(table.batchId, table.customId),
  uniqueIndex("batch_items_batch_pos_unique").on(table.batchId, table.position),
  index("batch_items_batch_status_idx").on(table.batchId, table.status),
  index("batch_items_status_retry_idx").on(table.status, table.retryAfterAt),
  index("batch_items_org_status_idx").on(table.organizationId, table.status),
]);

export const batchItemAttempts = pgTable("batch_item_attempts", {
  id: text().primaryKey(),
  batchItemId: text("batch_item_id").notNull().references(() => batchItems.id, { onDelete: "cascade" }),
  batchId: text("batch_id").notNull().references(() => batchJobs.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  executionId: text("execution_id").notNull(),
  gatewayRequestId: text("gateway_request_id"),
  status: text().notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  retryable: boolean().notNull().default(false),
  latencyMs: integer("latency_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("batch_attempts_item_attempt_unique").on(table.batchItemId, table.attemptNumber),
  uniqueIndex("batch_attempts_exec_unique").on(table.executionId),
  index("batch_attempts_batch_idx").on(table.batchId),
]);

export const batchChunks = pgTable("batch_chunks", {
  id: text().primaryKey(),
  batchId: text("batch_id").notNull().references(() => batchJobs.id, { onDelete: "cascade" }),
  sequence: integer().notNull(),
  status: batchChunkStatus().notNull().default("pending"),
  itemCount: integer("item_count").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("batch_chunks_batch_seq_unique").on(table.batchId, table.sequence),
  index("batch_chunks_status_idx").on(table.status, table.createdAt),
]);

export const batchLeases = pgTable("batch_leases", {
  id: text().primaryKey(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  leaseOwner: text("lease_owner").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("batch_leases_type_res_unique").on(table.resourceType, table.resourceId),
  index("batch_leases_expiry_idx").on(table.expiresAt),
]);

export const batchExecutionReservations = pgTable("batch_execution_reservations", {
  id: text().primaryKey(),
  batchId: text("batch_id").notNull().references(() => batchJobs.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  reservedCreditsAmount: numeric("reserved_credits_amount", { precision: 36, scale: 18 }).notNull(),
  settledCreditsAmount: numeric("settled_credits_amount", { precision: 36, scale: 18 }).notNull().default("0"),
  status: batchReservationStatus().notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("batch_res_batch_unique").on(table.batchId),
  index("batch_res_org_idx").on(table.organizationId),
]);

export const batchIdempotencyRecords = pgTable("batch_idempotency_records", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  batchId: text("batch_id").notNull().references(() => batchJobs.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("batch_idem_org_key_unique").on(table.organizationId, table.idempotencyKey),
  index("batch_idem_expiry_idx").on(table.expiresAt),
]);

export const routeTrafficControls = pgTable("route_traffic_controls", {
  id: text().primaryKey(),
  routeId: text("route_id").notNull().references(() => modelProviderRoutes.id, { onDelete: "cascade" }),
  mode: trafficControlMode().notNull().default("active"),
  maxTrafficPercent: integer("max_traffic_percent").notNull().default(100),
  drain: boolean().notNull().default(false),
  disabled: boolean().notNull().default(false),
  reason: text(),
  updatedBy: text("updated_by"),
  version: integer().notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("route_traffic_controls_route_unique").on(table.routeId),
  index("route_traffic_controls_mode_idx").on(table.mode),
]);

export const providerCredentialPools = pgTable("provider_credential_pools", {
  id: text().primaryKey(),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  name: text().notNull(),
  environment: text().notNull().default("production"),
  status: text().notNull().default("active"),
  accountLimitRpm: integer("account_limit_rpm"),
  accountLimitTpm: integer("account_limit_tpm"),
  accountLimitConcurrency: integer("account_limit_concurrency"),
  metadata: jsonb().notNull().default({}),
  ...timestamps,
}, (table) => [
  index("provider_credential_pools_provider_idx").on(table.providerId, table.status),
]);

export const routingDecisionsV2 = pgTable("routing_decisions_v2", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  routerVersion: text("router_version").notNull().default("v2"),
  policyVersion: integer("policy_version").notNull().default(1),
  objective: routingObjective().notNull().default("balanced"),
  requestProfileHash: text("request_profile_hash").notNull(),
  selectedRouteId: text("selected_route_id").notNull().references(() => modelProviderRoutes.id, { onDelete: "restrict" }),
  selectedRank: integer("selected_rank").notNull().default(1),
  candidateCount: integer("candidate_count").notNull().default(1),
  decisionReason: text("decision_reason").notNull(),
  shadowDecision: jsonb("shadow_decision"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("routing_decisions_v2_request_idx").on(table.requestId),
  index("routing_decisions_v2_tenant_idx").on(table.organizationId, table.workspaceId, table.createdAt),
]);

export const routingCandidateDecisions = pgTable("routing_candidate_decisions", {
  id: text().primaryKey(),
  routingDecisionId: text("routing_decision_id").notNull().references(() => routingDecisionsV2.id, { onDelete: "cascade" }),
  routeId: text("route_id").notNull().references(() => modelProviderRoutes.id, { onDelete: "cascade" }),
  eligible: boolean().notNull(),
  rejectionReason: text("rejection_reason"),
  totalScore: numeric("total_score", { precision: 5, scale: 2 }),
  rank: integer(),
  scores: jsonb().notNull().default({}),
  snapshotMetadata: jsonb("snapshot_metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("routing_candidate_decisions_decision_idx").on(table.routingDecisionId),
]);

export const routingSnapshots = pgTable("routing_snapshots", {
  id: text().primaryKey(),
  version: integer().notNull(),
  snapshotPayload: jsonb("snapshot_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("routing_snapshots_version_unique").on(table.version),
  index("routing_snapshots_expiry_idx").on(table.expiresAt),
]);

export const providerAccounts = pgTable("provider_accounts", {
  id: text().primaryKey(),
  providerId: text("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  externalAccountReference: text("external_account_reference"),
  accountType: text("account_type").notNull().default("standard"),
  status: text().notNull().default("active"),
  environment: text().notNull().default("production"),
  region: text(),
  residency: text(),
  priority: integer().notNull().default(100),
  metadata: jsonb().notNull().default({}),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  drainingAt: timestamp("draining_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("provider_accounts_provider_idx").on(table.providerId, table.status),
  index("provider_accounts_env_idx").on(table.environment),
]);

export const providerCredentialVersions = pgTable("provider_credential_versions", {
  id: text().primaryKey(),
  credentialId: text("credential_id").notNull().references(() => providerCredentials.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  secretReference: text("secret_reference").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  status: text().notNull().default("pending"),
  validationStatus: text("validation_status").notNull().default("unknown"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("provider_credential_versions_cred_ver_unique").on(table.credentialId, table.version),
  index("provider_credential_versions_secret_ref_idx").on(table.secretReference),
  index("provider_credential_versions_status_idx").on(table.status),
]);

export const providerCredentialPoolMembers = pgTable("provider_credential_pool_members", {
  id: text().primaryKey(),
  poolId: text("pool_id").notNull().references(() => providerCredentialPools.id, { onDelete: "cascade" }),
  providerAccountId: text("provider_account_id").notNull().references(() => providerAccounts.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().references(() => providerCredentials.id, { onDelete: "cascade" }),
  weight: integer().notNull().default(100),
  priority: integer().notNull().default(100),
  maxConcurrency: integer("max_concurrency"),
  status: text().notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("provider_credential_pool_members_unique").on(table.poolId, table.providerAccountId, table.credentialId),
  index("provider_credential_pool_members_pool_idx").on(table.poolId, table.status),
]);

export const providerAccountCapabilities = pgTable("provider_account_capabilities", {
  id: text().primaryKey(),
  providerAccountId: text("provider_account_id").notNull().references(() => providerAccounts.id, { onDelete: "cascade" }),
  canonicalModelId: text("canonical_model_id"),
  providerModelId: text("provider_model_id"),
  capability: text().notNull(),
  enabled: boolean().notNull().default(true),
  metadata: jsonb().notNull().default({}),
  ...timestamps,
}, (table) => [
  index("provider_account_capabilities_account_idx").on(table.providerAccountId, table.capability),
]);

export const providerAccountLimits = pgTable("provider_account_limits", {
  id: text().primaryKey(),
  providerAccountId: text("provider_account_id").notNull().references(() => providerAccounts.id, { onDelete: "cascade" }),
  canonicalModelId: text("canonical_model_id"),
  limitType: text("limit_type").notNull(),
  limitValue: bigint("limit_value", { mode: "number" }).notNull(),
  windowSeconds: integer("window_seconds"),
  source: text().notNull().default("configured"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("provider_account_limits_account_idx").on(table.providerAccountId, table.limitType),
]);

export const credentialValidations = pgTable("credential_validations", {
  id: text().primaryKey(),
  credentialVersionId: text("credential_version_id").notNull().references(() => providerCredentialVersions.id, { onDelete: "cascade" }),
  status: text().notNull(),
  latencyMs: integer("latency_ms"),
  safeErrorCode: text("safe_error_code"),
  details: jsonb().notNull().default({}),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("credential_validations_version_idx").on(table.credentialVersionId, table.checkedAt),
]);

export const promptDefinitions = pgTable("prompt_definitions", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  key: text().notNull(),
  name: text().notNull(),
  description: text(),
  type: text().notNull().default("user_template"),
  status: text().notNull().default("active"),
  visibility: text().notNull().default("organization"),
  isProtected: boolean("is_protected").notNull().default(false),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (table) => [
  index("prompt_definitions_org_key_idx").on(table.organizationId, table.key),
  index("prompt_definitions_org_status_idx").on(table.organizationId, table.status),
  uniqueIndex("prompt_definitions_org_ws_key_unique").on(table.organizationId, table.workspaceId, table.key),
]);

export const promptVersions = pgTable("prompt_versions", {
  id: text().primaryKey(),
  promptId: text("prompt_id").notNull().references(() => promptDefinitions.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  messages: jsonb().notNull().default([]),
  template: text(),
  templateFormat: text("template_format").notNull().default("mustache"),
  variableSchema: jsonb("variable_schema").notNull().default([]),
  outputSchema: jsonb("output_schema"),
  metadata: jsonb().notNull().default({}),
  contentHash: text("content_hash").notNull(),
  requiredCapabilities: jsonb("required_capabilities").notNull().default([]),
  preferredModelFamily: text("preferred_model_family"),
  allowedModels: jsonb("allowed_models").notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("prompt_versions_prompt_version_unique").on(table.promptId, table.version),
  index("prompt_versions_prompt_hash_idx").on(table.promptId, table.contentHash),
]);

export const promptReleases = pgTable("prompt_releases", {
  id: text().primaryKey(),
  promptId: text("prompt_id").notNull().references(() => promptDefinitions.id, { onDelete: "cascade" }),
  promptVersionId: text("prompt_version_id").notNull().references(() => promptVersions.id, { onDelete: "cascade" }),
  environment: text().notNull().default("production"),
  status: text().notNull().default("active"),
  releaseNumber: integer("release_number").notNull().default(1),
  releasedBy: text("released_by").notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  rollbackFromReleaseId: text("rollback_from_release_id"),
  notes: text(),
}, (table) => [
  index("prompt_releases_prompt_env_status_idx").on(table.promptId, table.environment, table.status),
  index("prompt_releases_version_idx").on(table.promptVersionId),
]);

export const promptReleaseHeads = pgTable("prompt_release_heads", {
  id: text().primaryKey(),
  promptId: text("prompt_id").notNull().references(() => promptDefinitions.id, { onDelete: "cascade" }),
  environment: text().notNull(),
  activeReleaseId: text("active_release_id").notNull().references(() => promptReleases.id, { onDelete: "cascade" }),
  activeVersionId: text("active_version_id").notNull().references(() => promptVersions.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("prompt_release_heads_prompt_env_unique").on(table.promptId, table.environment),
]);

export const promptExecutionReferences = pgTable("prompt_execution_references", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "cascade" }),
  promptId: text("prompt_id").notNull().references(() => promptDefinitions.id, { onDelete: "cascade" }),
  promptVersionId: text("prompt_version_id").notNull().references(() => promptVersions.id, { onDelete: "cascade" }),
  promptReleaseId: text("prompt_release_id"),
  contentHash: text("content_hash").notNull(),
  renderedHash: text("rendered_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("prompt_execution_references_request_idx").on(table.requestId),
  index("prompt_execution_references_prompt_version_idx").on(table.promptId, table.promptVersionId),
]);

// ==========================================
// Phase 30: Tool / Function Calling Infrastructure
// ==========================================

export const registeredTools = pgTable("registered_tools", {
  id: text().primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  key: text().notNull(),
  name: text().notNull(),
  description: text(),
  executionMode: text("execution_mode").notNull().default("return_to_client"),
  status: text().notNull().default("active"),
  visibility: text().notNull().default("organization"),
  activeVersion: integer("active_version").notNull().default(1),
  isProtected: boolean("is_protected").notNull().default(false),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (table) => [
  index("registered_tools_org_key_idx").on(table.organizationId, table.key),
  index("registered_tools_org_status_idx").on(table.organizationId, table.status),
  uniqueIndex("registered_tools_org_ws_key_unique").on(table.organizationId, table.workspaceId, table.key),
]);

export const registeredToolVersions = pgTable("registered_tool_versions", {
  id: text().primaryKey(),
  toolId: text("tool_id").notNull().references(() => registeredTools.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  description: text(),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema"),
  executionMode: text("execution_mode").notNull().default("return_to_client"),
  requiredCapabilities: jsonb("required_capabilities").notNull().default([]),
  contentHash: text("content_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("registered_tool_versions_tool_version_unique").on(table.toolId, table.version),
  index("registered_tool_versions_tool_hash_idx").on(table.toolId, table.contentHash),
]);

export const toolCallRecords = pgTable("tool_call_records", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  providerCallId: text("provider_call_id"),
  name: text().notNull(),
  arguments: jsonb().notNull().default({}),
  rawArguments: text("raw_arguments"),
  status: text().notNull().default("requested"),
  argumentsHash: text("arguments_hash"),
  ...timestamps,
}, (table) => [
  index("tool_call_records_request_idx").on(table.requestId),
  index("tool_call_records_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const toolContinuationStates = pgTable("tool_continuation_states", {
  id: text().primaryKey(),
  requestId: text("request_id").notNull().references(() => gatewayRequests.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  routeId: text("route_id").notNull(),
  modelId: text("model_id").notNull(),
  promptVersionId: text("prompt_version_id"),
  providerStateReference: text("provider_state_reference"),
  status: text().notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("tool_continuation_states_request_idx").on(table.requestId),
  index("tool_continuation_states_org_status_idx").on(table.organizationId, table.status),
  index("tool_continuation_states_expiry_idx").on(table.expiresAt),
]);

export const toolExecutionRecords = pgTable("tool_execution_records", {
  id: text().primaryKey(),
  toolCallId: text("tool_call_id").notNull().references(() => toolCallRecords.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: text().notNull().default("executing"),
  sideEffectClass: text("side_effect_class").notNull().default("read_only"),
  idempotencyKey: text("idempotency_key"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorCode: text("error_code"),
  resultHash: text("result_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tool_execution_records_call_idx").on(table.toolCallId),
  index("tool_execution_records_org_status_idx").on(table.organizationId, table.status),
]);

// ==========================================
// Phase 31: Structured Output — Response Schema Registry
// ==========================================

export const responseSchemaStatus = pgEnum("response_schema_status", ["active", "disabled", "archived"]);
export const responseSchemaVisibility = pgEnum("response_schema_visibility", ["organization", "workspace", "internal"]);

export const responseSchemas = pgTable("response_schemas", {
  id: text().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  key: text().notNull(),
  name: text().notNull(),
  description: text(),
  status: text().notNull().default("active"),
  visibility: text().notNull().default("organization"),
  activeVersion: integer("active_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("response_schemas_org_key_idx").on(table.organizationId, table.key),
  index("response_schemas_org_status_idx").on(table.organizationId, table.status),
]);

export const responseSchemaVersions = pgTable("response_schema_versions", {
  id: text().primaryKey(),
  schemaId: text("schema_id").notNull().references(() => responseSchemas.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  schema: jsonb().notNull(),
  schemaHash: text("schema_hash").notNull(),
  description: text(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("response_schema_versions_sid_ver_idx").on(table.schemaId, table.version),
  index("response_schema_versions_hash_idx").on(table.schemaHash),
]);
