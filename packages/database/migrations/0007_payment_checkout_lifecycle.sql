-- Phase 19: Payments + Checkout + Subscription Payment Lifecycle
-- Migration: 0007_payment_checkout_lifecycle

-- ─── Payment Customers ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payment_customers" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_customer_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "email" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_customers_provider_cus_unique" ON "payment_customers" USING btree ("provider", "provider_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_customers_org_provider_unique" ON "payment_customers" USING btree ("organization_id", "provider");
CREATE INDEX IF NOT EXISTS "payment_customers_org_idx" ON "payment_customers" USING btree ("organization_id");

-- ─── Checkout Sessions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "checkout_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "purpose" text NOT NULL,
  "plan_id" text REFERENCES "plans"("id") ON DELETE RESTRICT,
  "plan_version_id" text REFERENCES "plan_versions"("id") ON DELETE RESTRICT,
  "amount" numeric(36, 18) NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL DEFAULT 'created',
  "provider_session_id" text,
  "checkout_url" text,
  "success_return_url" text NOT NULL,
  "cancel_return_url" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_org_idempotency_unique" ON "checkout_sessions" USING btree ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "checkout_sessions_provider_session_idx" ON "checkout_sessions" USING btree ("provider", "provider_session_id");
CREATE INDEX IF NOT EXISTS "checkout_sessions_org_status_idx" ON "checkout_sessions" USING btree ("organization_id", "status");

-- ─── Payment Attempts ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "payment_id" text NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_attempt_id" text,
  "attempt_number" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "failure_code" text,
  "failure_category" text,
  "failure_message" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_payment_number_unique" ON "payment_attempts" USING btree ("payment_id", "attempt_number");
CREATE INDEX IF NOT EXISTS "payment_attempts_payment_idx" ON "payment_attempts" USING btree ("payment_id");
