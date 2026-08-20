CREATE TYPE "public"."actor_type" AS ENUM('user', 'service', 'apiKey', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."api_key_status" AS ENUM('active', 'expired', 'revoked', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."provider_attempt_status" AS ENUM('started', 'streaming', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."budget_mode" AS ENUM('warn', 'soft', 'hard');--> statement-breakpoint
CREATE TYPE "public"."environment_type" AS ENUM('development', 'staging', 'production', 'custom');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'past_due', 'void', 'uncollectible', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."limit_window" AS ENUM('minute', 'hour', 'day');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('active', 'preview', 'beta', 'deprecated', 'disabled', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'trial', 'restricted', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."policy_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."provider_status" AS ENUM('active', 'degraded', 'maintenance', 'disabled', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."gateway_request_status" AS ENUM('accepted', 'routing', 'executing', 'streaming', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'suspended', 'disabled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."wallet_status" AS ENUM('active', 'restricted', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'restricted', 'suspended', 'archived');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password_hash" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text,
	"metric" text NOT NULL,
	"operator" text NOT NULL,
	"threshold" bigint NOT NULL,
	"period" text NOT NULL,
	"channels" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_ip_allowlists" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"cidr" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_model_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"effect" "policy_effect" NOT NULL,
	"pattern" text NOT NULL,
	"category" text,
	"maximum_cost_minor" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_permissions" (
	"api_key_id" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_permissions_api_key_id_permission_pk" PRIMARY KEY("api_key_id","permission")
);
--> statement-breakpoint
CREATE TABLE "api_key_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"window" "limit_window" NOT NULL,
	"request_limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_rate_limits_positive" CHECK ("api_key_rate_limits"."request_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "api_key_spending_limits" (
	"api_key_id" text PRIMARY KEY NOT NULL,
	"mode" "budget_mode" NOT NULL,
	"per_request_minor" integer,
	"daily_minor" integer,
	"monthly_minor" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_spending_currency_length" CHECK (length("api_key_spending_limits"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "api_key_usage_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"spend_minor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"status" "api_key_status" DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"request_id" text NOT NULL,
	"trace_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"overage_policy" text DEFAULT 'none' NOT NULL,
	"grace_credits" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "billing_accounts_currency" CHECK (length("billing_accounts"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "billing_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_account_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"billing_email" text NOT NULL,
	"address" jsonb NOT NULL,
	"country" text NOT NULL,
	"tax_id" text,
	"purchase_order" text,
	"invoice_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"provider_id" text NOT NULL,
	"response_reference" text NOT NULL,
	"response_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"credits" bigint NOT NULL,
	"reason" text NOT NULL,
	"reference" text NOT NULL,
	"created_by" text NOT NULL,
	"ledger_transaction_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_conversion_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"currency" text NOT NULL,
	"credits_numerator" bigint NOT NULL,
	"money_minor_denominator" bigint NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_conversion_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "credit_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"credits" bigint NOT NULL,
	"remaining_credits" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_grants_nonnegative" CHECK ("credit_grants"."credits" >= 0 AND "credit_grants"."remaining_credits" >= 0 AND "credit_grants"."remaining_credits" <= "credit_grants"."credits")
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"request_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"estimated_credits" bigint NOT NULL,
	"reserved_credits" bigint NOT NULL,
	"status" text NOT NULL,
	"allocations" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"currency" text NOT NULL,
	"status" "wallet_status" DEFAULT 'active' NOT NULL,
	"cached_available_credits" bigint DEFAULT 0 NOT NULL,
	"cached_reserved_credits" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_wallets_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "developer_onboarding" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"first_api_key_at" timestamp with time zone,
	"first_gateway_request_at" timestamp with time zone,
	"first_successful_request_at" timestamp with time zone,
	"first_playground_request_at" timestamp with time zone,
	"billing_configured_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developer_onboarding_organization_id_workspace_id_pk" PRIMARY KEY("organization_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "environment_type" NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"provider_attempt_id" text,
	"code" text NOT NULL,
	"retryable" boolean NOT NULL,
	"safe_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"numerator" bigint NOT NULL,
	"denominator" bigint NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."numerator" > 0 AND "exchange_rates"."denominator" > 0)
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text,
	"requested_by" text NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"filters" jsonb NOT NULL,
	"status" text NOT NULL,
	"storage_reference" text,
	"row_count" integer,
	"expires_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_format" CHECK ("exports"."format" IN ('csv', 'json'))
);
--> statement-breakpoint
CREATE TABLE "fallback_chains" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_policy_version_id" text NOT NULL,
	"name" text NOT NULL,
	"targets" jsonb NOT NULL,
	"max_attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"requested_model" text NOT NULL,
	"resolved_model" text,
	"status" "gateway_request_status" NOT NULL,
	"stream" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"response_reference" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"impact" text NOT NULL,
	"components" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_period_id" text,
	"number" text NOT NULL,
	"status" "invoice_status" NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"pdf_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_nonnegative" CHECK ("invoices"."subtotal_minor" >= 0 AND "invoices"."discount_minor" >= 0 AND "invoices"."tax_minor" >= 0 AND "invoices"."total_minor" >= 0 AND "invoices"."amount_paid_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "latency_records" (
	"request_id" text PRIMARY KEY NOT NULL,
	"gateway_overhead_ms" integer,
	"provider_latency_ms" integer,
	"time_to_first_token_ms" integer,
	"total_latency_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"account_id" text NOT NULL,
	"direction" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_positive" CHECK ("ledger_entries"."amount_minor" > 0),
	CONSTRAINT "ledger_entries_direction" CHECK ("ledger_entries"."direction" IN ('debit', 'credit'))
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"type" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reversal_of_id" text,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"organization_id" text NOT NULL,
	"member_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_roles_member_id_role_id_pk" PRIMARY KEY("member_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "model_alias_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"alias_id" text NOT NULL,
	"version" text NOT NULL,
	"targets" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "model_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "model_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_model_id" text NOT NULL,
	"region" text NOT NULL,
	"environment_type" "environment_type" NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_deprecations" (
	"provider_model_id" text PRIMARY KEY NOT NULL,
	"announced_at" timestamp with time zone NOT NULL,
	"shutdown_at" timestamp with time zone,
	"replacement_model_id" text,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"pricing_version_id" text NOT NULL,
	"public_model_id" text NOT NULL,
	"input_per_million_minor" bigint NOT NULL,
	"output_per_million_minor" bigint NOT NULL,
	"cached_per_million_minor" bigint DEFAULT 0 NOT NULL,
	"reasoning_per_million_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"webhook" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_organization_id_category_pk" PRIMARY KEY("user_id","organization_id","category")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"joined_at" timestamp with time zone,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"status" "organization_status" DEFAULT 'trial' NOT NULL,
	"owner_user_id" text NOT NULL,
	"billing_email" text,
	"country" text,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_currency_length" CHECK (length("organizations"."default_currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payment_id" text,
	"payload_hash" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failure" text
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_payment_method_id" text NOT NULL,
	"type" text NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_payment_id" text,
	"idempotency_key_hash" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" NOT NULL,
	"purpose" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"failure_code" text,
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_nonnegative" CHECK ("payments"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"currency" text NOT NULL,
	"monthly_price_minor" bigint NOT NULL,
	"included_credits" bigint NOT NULL,
	"configuration" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"pricing_version_id" text NOT NULL,
	"level" text NOT NULL,
	"scope_id" text,
	"method" text NOT NULL,
	"markup_basis_points" integer,
	"fixed_amount_minor" bigint,
	"currency" text,
	"minimum_margin_basis_points" integer NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "privileged_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"reason" text NOT NULL,
	"approval_reference" text,
	"request_id" text NOT NULL,
	"result" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privileged_session_capabilities" (
	"session_id" text NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "privileged_session_capabilities_session_id_capability_pk" PRIMARY KEY("session_id","capability")
);
--> statement-breakpoint
CREATE TABLE "privileged_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"authentication_strength" text NOT NULL,
	"reason" text NOT NULL,
	"approval_reference" text,
	"scope" jsonb NOT NULL,
	"break_glass" boolean DEFAULT false NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "provider_attempt_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"first_token_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"error_code" text,
	"provider_request_id" text
);
--> statement-breakpoint
CREATE TABLE "provider_capacity_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"connection_id" text,
	"provider_model_id" text,
	"maximum_concurrency" integer NOT NULL,
	"requests_per_minute" integer NOT NULL,
	"tokens_per_minute" integer NOT NULL,
	"safety_margin_basis_points" integer DEFAULT 8000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_capacity_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"capacity_limit_id" text NOT NULL,
	"current_concurrency" integer NOT NULL,
	"requests_per_minute" integer NOT NULL,
	"tokens_per_minute" integer NOT NULL,
	"utilization_basis_points" integer NOT NULL,
	"state" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_circuit_states" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text,
	"connection_id" text,
	"state" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"half_open_attempts" integer DEFAULT 0 NOT NULL,
	"half_open_successes" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"environment_id" text,
	"status" "provider_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_cost_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"pricing_version_id" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cached_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"key_version" text NOT NULL,
	"last_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"state" text NOT NULL,
	"latency_ms" integer,
	"success_rate_basis_points" integer,
	"sampled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_maintenance_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_model_capabilities" (
	"provider_model_id" text NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "provider_model_capabilities_provider_model_id_capability_pk" PRIMARY KEY("provider_model_id","capability")
);
--> statement-breakpoint
CREATE TABLE "provider_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"public_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "model_status" DEFAULT 'active' NOT NULL,
	"context_window" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_pricing_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_model_id" text NOT NULL,
	"currency" text NOT NULL,
	"input_per_million_minor" integer NOT NULL,
	"output_per_million_minor" integer NOT NULL,
	"cached_per_million_minor" integer,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_weights" (
	"routing_policy_version_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"weight_basis_points" integer NOT NULL,
	CONSTRAINT "provider_weights_routing_policy_version_id_provider_id_pk" PRIMARY KEY("routing_policy_version_id","provider_id"),
	CONSTRAINT "provider_weight_range" CHECK ("provider_weights"."weight_basis_points" >= 0 AND "provider_weights"."weight_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "provider_status" DEFAULT 'active' NOT NULL,
	"adapter_type" text NOT NULL,
	"base_url" text NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"organization_id" text,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"expected" jsonb NOT NULL,
	"actual" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"examined" integer DEFAULT 0 NOT NULL,
	"mismatches" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_refund_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_positive" CHECK ("refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_rule_id" text NOT NULL,
	"action" text NOT NULL,
	"configuration" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_candidate_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_decision_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"cost_score_basis_points" integer NOT NULL,
	"latency_score_basis_points" integer NOT NULL,
	"reliability_score_basis_points" integer NOT NULL,
	"capacity_score_basis_points" integer NOT NULL,
	"preference_score_basis_points" integer NOT NULL,
	"final_score_basis_points" integer NOT NULL,
	"eligible" boolean NOT NULL,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "routing_conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_rule_id" text NOT NULL,
	"field" text NOT NULL,
	"operator" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"requested_model" text NOT NULL,
	"resolved_model" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"routing_policy_version_id" text,
	"selection_reason" text NOT NULL,
	"fallback_chain" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_policy_id" text NOT NULL,
	"version" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_policy_version_id" text NOT NULL,
	"priority" integer NOT NULL,
	"condition" jsonb NOT NULL,
	"target" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"request_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_account_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"service_account_id" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_name" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"included_credits" bigint NOT NULL,
	"invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_version_id" text NOT NULL,
	"payment_provider" text NOT NULL,
	"external_subscription_id" text,
	"status" "subscription_status" NOT NULL,
	"currency" text NOT NULL,
	"billing_interval" text NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"country" text NOT NULL,
	"region" text,
	"tax_id" text,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"reverse_charge_eligible" boolean DEFAULT false NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_profiles_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"region" text,
	"category" text NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_range" CHECK ("tax_rates"."rate_basis_points" >= 0 AND "tax_rates"."rate_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"organization_member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_organization_member_id_pk" PRIMARY KEY("team_id","organization_member_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_usage_records" (
	"usage_record_id" text PRIMARY KEY NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"routing_policy_version_id" text NOT NULL,
	"stable_key" text NOT NULL,
	"allocation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"event_id" text NOT NULL,
	"provider_pricing_version_id" text,
	"provider_currency" text,
	"estimated_provider_cost_minor" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "usage_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"usage_record_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider_cost_minor" bigint NOT NULL,
	"customer_charge_minor" bigint NOT NULL,
	"credits_consumed" bigint NOT NULL,
	"currency" text NOT NULL,
	"pricing_version" integer NOT NULL,
	"conversion_version" integer NOT NULL,
	"ledger_transaction_id" text NOT NULL,
	"status" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_settlements_nonnegative" CHECK ("usage_settlements"."provider_cost_minor" >= 0 AND "usage_settlements"."customer_charge_minor" >= 0 AND "usage_settlements"."credits_consumed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_organization_id" text,
	"preferred_workspace_id" text,
	"preferred_environment_id" text,
	"theme" text DEFAULT 'system' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"default_playground_model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"identifier" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_endpoint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"request_headers" jsonb NOT NULL,
	"response_status" integer,
	"response_body_redacted" text,
	"latency_ms" integer,
	"failure_code" text,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"webhook_endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_webhook_endpoint_id_event_type_pk" PRIMARY KEY("webhook_endpoint_id","event_type")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_teams" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "workspace_teams_workspace_id_team_id_pk" PRIMARY KEY("workspace_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"region" text DEFAULT 'auto' NOT NULL,
	"default_environment_id" text,
	"created_by" text NOT NULL,
	"archived_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_ip_allowlists" ADD CONSTRAINT "api_key_ip_allowlists_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_model_rules" ADD CONSTRAINT "api_key_model_rules_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_permissions" ADD CONSTRAINT "api_key_permissions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_rate_limits" ADD CONSTRAINT "api_key_rate_limits_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_spending_limits" ADD CONSTRAINT "api_key_spending_limits_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_usage_snapshots" ADD CONSTRAINT "api_key_usage_snapshots_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_records" ADD CONSTRAINT "cache_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_records" ADD CONSTRAINT "cache_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_records" ADD CONSTRAINT "cache_records_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_onboarding" ADD CONSTRAINT "developer_onboarding_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_onboarding" ADD CONSTRAINT "developer_onboarding_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_records" ADD CONSTRAINT "error_records_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_records" ADD CONSTRAINT "error_records_provider_attempt_id_provider_attempts_id_fk" FOREIGN KEY ("provider_attempt_id") REFERENCES "public"."provider_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallback_chains" ADD CONSTRAINT "fallback_chains_routing_policy_version_id_routing_policy_versions_id_fk" FOREIGN KEY ("routing_policy_version_id") REFERENCES "public"."routing_policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_requests" ADD CONSTRAINT "gateway_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_requests" ADD CONSTRAINT "gateway_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_requests" ADD CONSTRAINT "gateway_requests_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_requests" ADD CONSTRAINT "gateway_requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_period_id_subscription_periods_id_fk" FOREIGN KEY ("subscription_period_id") REFERENCES "public"."subscription_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latency_records" ADD CONSTRAINT "latency_records_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_organization_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_alias_versions" ADD CONSTRAINT "model_alias_versions_alias_id_model_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."model_aliases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_availability" ADD CONSTRAINT "model_availability_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_deprecations" ADD CONSTRAINT "model_deprecations_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_prices" ADD CONSTRAINT "model_prices_pricing_version_id_pricing_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_pricing_version_id_pricing_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_versions" ADD CONSTRAINT "pricing_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privileged_audit_events" ADD CONSTRAINT "privileged_audit_events_session_id_privileged_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."privileged_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privileged_session_capabilities" ADD CONSTRAINT "privileged_session_capabilities_session_id_privileged_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."privileged_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD CONSTRAINT "provider_attempts_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD CONSTRAINT "provider_attempts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_attempts" ADD CONSTRAINT "provider_attempts_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capacity_limits" ADD CONSTRAINT "provider_capacity_limits_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capacity_limits" ADD CONSTRAINT "provider_capacity_limits_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capacity_limits" ADD CONSTRAINT "provider_capacity_limits_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capacity_snapshots" ADD CONSTRAINT "provider_capacity_snapshots_capacity_limit_id_provider_capacity_limits_id_fk" FOREIGN KEY ("capacity_limit_id") REFERENCES "public"."provider_capacity_limits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_circuit_states" ADD CONSTRAINT "provider_circuit_states_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_circuit_states" ADD CONSTRAINT "provider_circuit_states_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_circuit_states" ADD CONSTRAINT "provider_circuit_states_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cost_records" ADD CONSTRAINT "provider_cost_records_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cost_records" ADD CONSTRAINT "provider_cost_records_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cost_records" ADD CONSTRAINT "provider_cost_records_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cost_records" ADD CONSTRAINT "provider_cost_records_pricing_version_id_provider_pricing_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."provider_pricing_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_snapshots" ADD CONSTRAINT "provider_health_snapshots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_maintenance_windows" ADD CONSTRAINT "provider_maintenance_windows_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_maintenance_windows" ADD CONSTRAINT "provider_maintenance_windows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_model_capabilities" ADD CONSTRAINT "provider_model_capabilities_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_pricing_versions" ADD CONSTRAINT "provider_pricing_versions_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_weights" ADD CONSTRAINT "provider_weights_routing_policy_version_id_routing_policy_versions_id_fk" FOREIGN KEY ("routing_policy_version_id") REFERENCES "public"."routing_policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_weights" ADD CONSTRAINT "provider_weights_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_actions" ADD CONSTRAINT "routing_actions_routing_rule_id_routing_rules_id_fk" FOREIGN KEY ("routing_rule_id") REFERENCES "public"."routing_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_candidate_scores" ADD CONSTRAINT "routing_candidate_scores_routing_decision_id_routing_decisions_id_fk" FOREIGN KEY ("routing_decision_id") REFERENCES "public"."routing_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_candidate_scores" ADD CONSTRAINT "routing_candidate_scores_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_candidate_scores" ADD CONSTRAINT "routing_candidate_scores_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_conditions" ADD CONSTRAINT "routing_conditions_routing_rule_id_routing_rules_id_fk" FOREIGN KEY ("routing_rule_id") REFERENCES "public"."routing_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_provider_model_id_provider_models_id_fk" FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_routing_policy_version_id_routing_policy_versions_id_fk" FOREIGN KEY ("routing_policy_version_id") REFERENCES "public"."routing_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policy_versions" ADD CONSTRAINT "routing_policy_versions_routing_policy_id_routing_policies_id_fk" FOREIGN KEY ("routing_policy_id") REFERENCES "public"."routing_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_routing_policy_version_id_routing_policy_versions_id_fk" FOREIGN KEY ("routing_policy_version_id") REFERENCES "public"."routing_policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_credentials" ADD CONSTRAINT "service_account_credentials_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage_records" ADD CONSTRAINT "token_usage_records_usage_record_id_usage_records_id_fk" FOREIGN KEY ("usage_record_id") REFERENCES "public"."usage_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_routing_policy_version_id_routing_policy_versions_id_fk" FOREIGN KEY ("routing_policy_version_id") REFERENCES "public"."routing_policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_provider_pricing_version_id_provider_pricing_versions_id_fk" FOREIGN KEY ("provider_pricing_version_id") REFERENCES "public"."provider_pricing_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_settlements" ADD CONSTRAINT "usage_settlements_request_id_gateway_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."gateway_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_settlements" ADD CONSTRAINT "usage_settlements_usage_record_id_usage_records_id_fk" FOREIGN KEY ("usage_record_id") REFERENCES "public"."usage_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_settlements" ADD CONSTRAINT "usage_settlements_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_settlements" ADD CONSTRAINT "usage_settlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_settlements" ADD CONSTRAINT "usage_settlements_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_preferred_organization_id_organizations_id_fk" FOREIGN KEY ("preferred_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_preferred_workspace_id_workspaces_id_fk" FOREIGN KEY ("preferred_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_preferred_environment_id_environments_id_fk" FOREIGN KEY ("preferred_environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teams" ADD CONSTRAINT "workspace_teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teams" ADD CONSTRAINT "workspace_teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teams" ADD CONSTRAINT "workspace_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_rules_scope_idx" ON "alert_rules" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_ip_allowlists_key_cidr_unique" ON "api_key_ip_allowlists" USING btree ("api_key_id","cidr");--> statement-breakpoint
CREATE INDEX "api_key_model_rules_key_idx" ON "api_key_model_rules" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_rate_limits_key_window_unique" ON "api_key_rate_limits" USING btree ("api_key_id","window");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_usage_period_unique" ON "api_key_usage_snapshots" USING btree ("api_key_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_unique" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_idx" ON "api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_environment_idx" ON "api_keys" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "api_keys_status_idx" ON "api_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_keys_expiry_idx" ON "api_keys" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "api_keys_last_used_idx" ON "api_keys" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "api_keys_org_workspace_idx" ON "api_keys" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_environment_idx" ON "api_keys" USING btree ("workspace_id","environment_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_idx" ON "audit_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cache_records_tenant_fingerprint_unique" ON "cache_records" USING btree ("organization_id","workspace_id","fingerprint");--> statement-breakpoint
CREATE INDEX "cache_records_expiry_idx" ON "cache_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "credit_grants_wallet_expiry_idx" ON "credit_grants" USING btree ("wallet_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grants_source_unique" ON "credit_grants" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_reservations_request_unique" ON "credit_reservations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "credit_reservations_wallet_status_idx" ON "credit_reservations" USING btree ("wallet_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_workspace_slug_unique" ON "environments" USING btree ("organization_id","workspace_id","slug");--> statement-breakpoint
CREATE INDEX "environments_workspace_idx" ON "environments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "error_records_request_idx" ON "error_records" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_observation_unique" ON "exchange_rates" USING btree ("base_currency","quote_currency","source","observed_at");--> statement-breakpoint
CREATE INDEX "exports_scope_status_idx" ON "exports" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE INDEX "gateway_requests_tenant_created_idx" ON "gateway_requests" USING btree ("organization_id","workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "gateway_requests_key_idx" ON "gateway_requests" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("organization_id","workspace_id","endpoint","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "incident_updates_incident_time_idx" ON "incident_updates" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_status_started_idx" ON "incidents" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_source_unique" ON "invoice_lines" USING btree ("invoice_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_scope_code_unique" ON "ledger_accounts" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_unique" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_reference_unique" ON "ledger_transactions" USING btree ("type","reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "member_roles_org_idx" ON "member_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_alias_versions_unique" ON "model_alias_versions" USING btree ("alias_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "model_availability_scope_unique" ON "model_availability" USING btree ("provider_model_id","region","environment_type");--> statement-breakpoint
CREATE UNIQUE INDEX "model_prices_version_model_unique" ON "model_prices" USING btree ("pricing_version_id","public_model_id");--> statement-breakpoint
CREATE INDEX "notifications_user_state_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_token_unique" ON "organization_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_invitations_org_email_idx" ON "organization_invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_tenant_user_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_external_unique" ON "payment_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_status_idx" ON "payment_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_provider_external_unique" ON "payment_methods" USING btree ("provider","external_payment_method_id");--> statement-breakpoint
CREATE INDEX "payment_methods_org_idx" ON "payment_methods" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_unique" ON "payments" USING btree ("provider","idempotency_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_external_unique" ON "payments" USING btree ("provider","external_payment_id");--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_unique" ON "plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "pricing_rules_version_level_idx" ON "pricing_rules" USING btree ("pricing_version_id","level");--> statement-breakpoint
CREATE INDEX "privileged_audit_operator_time_idx" ON "privileged_audit_events" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "privileged_audit_resource_idx" ON "privileged_audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "privileged_sessions_operator_expiry_idx" ON "privileged_sessions" USING btree ("operator_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_attempts_request_number_unique" ON "provider_attempts" USING btree ("request_id","attempt_number");--> statement-breakpoint
CREATE INDEX "provider_capacity_snapshot_limit_time_idx" ON "provider_capacity_snapshots" USING btree ("capacity_limit_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_circuit_scope_unique" ON "provider_circuit_states" USING btree ("provider_id","provider_model_id","connection_id");--> statement-breakpoint
CREATE INDEX "provider_connections_scope_idx" ON "provider_connections" USING btree ("organization_id","workspace_id","environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cost_records_request_unique" ON "provider_cost_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "provider_health_provider_sample_idx" ON "provider_health_snapshots" USING btree ("provider_id","sampled_at");--> statement-breakpoint
CREATE INDEX "provider_maintenance_provider_time_idx" ON "provider_maintenance_windows" USING btree ("provider_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_models_public_unique" ON "provider_models" USING btree ("public_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_models_native_unique" ON "provider_models" USING btree ("provider_id","provider_model_id");--> statement-breakpoint
CREATE INDEX "provider_models_status_idx" ON "provider_models" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reconciliation_items_run_status_idx" ON "reconciliation_items" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_domain_period_idx" ON "reconciliation_runs" USING btree ("domain","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_external_unique" ON "refunds" USING btree ("provider","external_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_key_unique" ON "roles" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "routing_candidate_scores_decision_idx" ON "routing_candidate_scores" USING btree ("routing_decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_decisions_request_unique" ON "routing_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_policy_version_unique" ON "routing_policy_versions" USING btree ("routing_policy_id","version");--> statement-breakpoint
CREATE INDEX "security_events_user_created_idx" ON "security_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_account_credentials_prefix_unique" ON "service_account_credentials" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "service_account_credentials_account_idx" ON "service_account_credentials" USING btree ("service_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_scope_name_unique" ON "service_accounts" USING btree ("organization_id","workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_period_unique" ON "subscription_periods" USING btree ("subscription_id","starts_at");--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_external_unique" ON "subscriptions" USING btree ("payment_provider","external_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_version_scope_unique" ON "tax_rates" USING btree ("country","region","category","version");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_slug_unique" ON "teams" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_settlements_request_unique" ON "usage_settlements" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_settlements_usage_unique" ON "usage_settlements" USING btree ("usage_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_token_hash_unique" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification_tokens" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_endpoint_event_unique" ON "webhook_deliveries" USING btree ("webhook_endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_queue_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_scope_idx" ON "webhook_deliveries" USING btree ("organization_id","workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_attempt_unique" ON "webhook_delivery_attempts" USING btree ("delivery_id","attempt");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_scope_idx" ON "webhook_endpoints" USING btree ("organization_id","workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_tenant_user_unique" ON "workspace_members" USING btree ("organization_id","workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_org_slug_unique" ON "workspaces" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "workspaces_org_idx" ON "workspaces" USING btree ("organization_id");