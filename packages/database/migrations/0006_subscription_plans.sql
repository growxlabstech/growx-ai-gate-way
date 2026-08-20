-- Phase 18: Subscription Plans + Entitlements + Recurring Credit Grants
-- Migration: 0006_subscription_plans

-- ─── New Enums ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."plan_version_status" AS ENUM('draft', 'active', 'archived', 'grandfathered');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."entitlement_type" AS ENUM('boolean', 'integer', 'decimal', 'string', 'set');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."subscription_funding_mode" AS ENUM('manual', 'free', 'external_payment_future', 'enterprise_contract');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."subscription_period_status" AS ENUM('pending', 'active', 'renewed', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Plans ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plans" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "is_public" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_unique" ON "plans" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "plans_status_idx" ON "plans" USING btree ("status");

-- ─── Plan Versions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plan_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_id" text NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "status" "plan_version_status" NOT NULL DEFAULT 'draft',
  "billing_interval" text NOT NULL,
  "base_price_amount" numeric(36, 18) NOT NULL DEFAULT '0',
  "currency" text NOT NULL DEFAULT 'USD',
  "credit_grant_amount" numeric(36, 18) NOT NULL DEFAULT '0',
  "feature_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "commercial_terms" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_versions_plan_version_unique" ON "plan_versions" USING btree ("plan_id", "version");
CREATE INDEX IF NOT EXISTS "plan_versions_plan_idx" ON "plan_versions" USING btree ("plan_id");
CREATE INDEX IF NOT EXISTS "plan_versions_status_idx" ON "plan_versions" USING btree ("status");

-- ─── Plan Entitlements ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plan_entitlements" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_version_id" text NOT NULL REFERENCES "plan_versions"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "type" "entitlement_type" NOT NULL,
  "value" text NOT NULL,
  "description" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_entitlements_version_key_unique" ON "plan_entitlements" USING btree ("plan_version_id", "key");

-- ─── Plan Model Access Rules ────────────────────────────────

CREATE TABLE IF NOT EXISTS "plan_model_access_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_version_id" text NOT NULL REFERENCES "plan_versions"("id") ON DELETE CASCADE,
  "pattern" text NOT NULL,
  "effect" "policy_effect" NOT NULL,
  "max_tokens_per_request" integer,
  "rate_limit_override" jsonb
);

CREATE INDEX IF NOT EXISTS "plan_model_access_rules_version_idx" ON "plan_model_access_rules" USING btree ("plan_version_id");

-- ─── Plan Limits ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plan_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_version_id" text NOT NULL REFERENCES "plan_versions"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "value" integer NOT NULL,
  "window" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_limits_version_key_unique" ON "plan_limits" USING btree ("plan_version_id", "key");

-- ─── Organization Subscriptions ──────────────────────────────

CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "plan_id" text NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
  "plan_version_id" text NOT NULL REFERENCES "plan_versions"("id") ON DELETE RESTRICT,
  "status" "subscription_status" NOT NULL DEFAULT 'active',
  "current_period_start" timestamp with time zone NOT NULL,
  "current_period_end" timestamp with time zone NOT NULL,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "cancelled_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "resumed_at" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "funding_mode" "subscription_funding_mode" NOT NULL DEFAULT 'manual',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "org_subscriptions_org_status_idx" ON "organization_subscriptions" USING btree ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "org_subscriptions_renewal_idx" ON "organization_subscriptions" USING btree ("current_period_end", "status");

-- ─── Subscription Periods ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "subscription_periods" (
  "id" text PRIMARY KEY NOT NULL,
  "subscription_id" text NOT NULL REFERENCES "organization_subscriptions"("id") ON DELETE RESTRICT,
  "period_number" integer NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "credit_grant_id" text,
  "status" "subscription_period_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_periods_sub_number_unique" ON "subscription_periods" USING btree ("subscription_id", "period_number");

-- ─── Entitlement Overrides ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "entitlement_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "key" text NOT NULL,
  "type" "entitlement_type" NOT NULL,
  "value" text NOT NULL,
  "reason" text NOT NULL,
  "expires_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "entitlement_overrides_org_key_unique" ON "entitlement_overrides" USING btree ("organization_id", "key");
