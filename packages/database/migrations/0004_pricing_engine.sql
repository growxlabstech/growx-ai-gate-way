CREATE TABLE IF NOT EXISTS "provider_price_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL REFERENCES "public"."providers"("id") ON DELETE restrict,
	"provider_route_id" text REFERENCES "public"."model_provider_routes"("id") ON DELETE cascade,
	"canonical_model_id" text REFERENCES "public"."canonical_models"("id") ON DELETE cascade,
	"provider_model_id" text,
	"region" text DEFAULT 'global' NOT NULL,
	"credential_id" text REFERENCES "public"."provider_credentials"("id") ON DELETE cascade,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"source" text DEFAULT 'contract' NOT NULL,
	"source_reference" text,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_price_schedules_provider_idx" ON "provider_price_schedules" USING btree ("provider_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_price_schedules_effective_idx" ON "provider_price_schedules" USING btree ("effective_from","effective_to");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL REFERENCES "public"."provider_price_schedules"("id") ON DELETE cascade,
	"usage_type" text NOT NULL,
	"unit" text DEFAULT 'token' NOT NULL,
	"price" text NOT NULL,
	"per_units" bigint DEFAULT 1000000 NOT NULL,
	"minimum_charge" text,
	"tier_start" bigint,
	"tier_end" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_rates_schedule_idx" ON "provider_rates" USING btree ("schedule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_rates_type_idx" ON "provider_rates" USING btree ("schedule_id","usage_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_cost_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL REFERENCES "public"."gateway_requests"("id") ON DELETE restrict,
	"organization_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE restrict,
	"workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE restrict,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" text DEFAULT '0' NOT NULL,
	"cost_status" text DEFAULT 'exact' NOT NULL,
	"price_version_set" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_cost_records_request_unique" ON "provider_cost_records" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_cost_records_tenant_idx" ON "provider_cost_records" USING btree ("organization_id","workspace_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_cost_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"cost_record_id" text NOT NULL REFERENCES "public"."provider_cost_records"("id") ON DELETE cascade,
	"request_id" text NOT NULL REFERENCES "public"."gateway_requests"("id") ON DELETE restrict,
	"attempt_id" text REFERENCES "public"."provider_attempts"("id") ON DELETE set null,
	"usage_event_id" text,
	"provider_id" text NOT NULL REFERENCES "public"."providers"("id") ON DELETE restrict,
	"provider_route_id" text,
	"canonical_model_id" text NOT NULL,
	"usage_type" text NOT NULL,
	"quantity" bigint NOT NULL,
	"unit" text DEFAULT 'token' NOT NULL,
	"price_schedule_id" text NOT NULL REFERENCES "public"."provider_price_schedules"("id") ON DELETE restrict,
	"price_version" integer DEFAULT 1 NOT NULL,
	"rate" text NOT NULL,
	"per_units" bigint NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text DEFAULT 'contract' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_cost_lines_record_idx" ON "provider_cost_lines" USING btree ("cost_record_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_cost_lines_request_idx" ON "provider_cost_lines" USING btree ("request_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_pricing_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"pricing_model" text DEFAULT 'fixed_model_rate' NOT NULL,
	"cache_pricing_mode" text DEFAULT 'discount_percentage' NOT NULL,
	"cache_discount_percentage" text,
	"retry_overhead_policy" text DEFAULT 'absorbed_by_growx' NOT NULL,
	"markup_basis_points" bigint,
	"markup_multiplier" text,
	"fixed_fee" text,
	"minimum_margin_basis_points" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_pricing_policies_scope_idx" ON "customer_pricing_policies" USING btree ("scope_type","scope_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_rate_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"pricing_policy_id" text NOT NULL REFERENCES "public"."customer_pricing_policies"("id") ON DELETE cascade,
	"canonical_model_id" text REFERENCES "public"."canonical_models"("id") ON DELETE cascade,
	"operation" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_rate_schedules_policy_idx" ON "customer_rate_schedules" USING btree ("pricing_policy_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_rate_schedules_model_idx" ON "customer_rate_schedules" USING btree ("pricing_policy_id","canonical_model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL REFERENCES "public"."customer_rate_schedules"("id") ON DELETE cascade,
	"usage_type" text NOT NULL,
	"unit" text DEFAULT 'token' NOT NULL,
	"price" text NOT NULL,
	"per_units" bigint DEFAULT 1000000 NOT NULL,
	"minimum_charge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_rates_schedule_idx" ON "customer_rates" USING btree ("schedule_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_price_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL REFERENCES "public"."gateway_requests"("id") ON DELETE restrict,
	"organization_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE restrict,
	"workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE restrict,
	"api_key_id" text REFERENCES "public"."api_keys"("id") ON DELETE set null,
	"pricing_policy_id" text NOT NULL REFERENCES "public"."customer_pricing_policies"("id") ON DELETE restrict,
	"pricing_policy_version" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" text DEFAULT '0' NOT NULL,
	"pricing_status" text DEFAULT 'final' NOT NULL,
	"execution_source" text DEFAULT 'live_provider' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_price_records_request_unique" ON "customer_price_records" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_price_records_tenant_idx" ON "customer_price_records" USING btree ("organization_id","workspace_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_price_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"price_record_id" text NOT NULL REFERENCES "public"."customer_price_records"("id") ON DELETE cascade,
	"usage_type" text NOT NULL,
	"quantity" bigint NOT NULL,
	"unit" text DEFAULT 'token' NOT NULL,
	"rate" text NOT NULL,
	"per_units" bigint NOT NULL,
	"amount" text NOT NULL,
	"rule_type" text DEFAULT 'fixed_model_rate' NOT NULL,
	"source_usage_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_price_lines_record_idx" ON "customer_price_lines" USING btree ("price_record_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL REFERENCES "public"."gateway_requests"("id") ON DELETE restrict,
	"organization_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE restrict,
	"workspace_id" text NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE restrict,
	"target_type" text NOT NULL,
	"target_record_id" text NOT NULL,
	"target_line_id" text,
	"usage_reconciliation_id" text,
	"previous_amount" text NOT NULL,
	"new_amount" text NOT NULL,
	"difference_amount" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reason" text NOT NULL,
	"operator_id" text NOT NULL,
	"applied_price_schedule_id" text,
	"applied_price_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_adjustments_request_idx" ON "pricing_adjustments" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_adjustments_tenant_idx" ON "pricing_adjustments" USING btree ("organization_id","workspace_id","created_at");
