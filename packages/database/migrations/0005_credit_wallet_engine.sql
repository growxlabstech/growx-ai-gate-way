-- Phase 17: Credit & Wallet Engine Migration

CREATE TABLE IF NOT EXISTS "wallet_balances" (
	"wallet_id" text PRIMARY KEY NOT NULL REFERENCES "credit_wallets"("id") ON DELETE cascade ON UPDATE no action,
	"available" numeric(36, 18) DEFAULT '0' NOT NULL,
	"reserved" numeric(36, 18) DEFAULT '0' NOT NULL,
	"total" numeric(36, 18) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "wallet_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL REFERENCES "credit_wallets"("id") ON DELETE restrict ON UPDATE no action,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sequence" bigint NOT NULL,
	"entry_type" text NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"direction" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"idempotency_key" text,
	"balance_after" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL REFERENCES "credit_wallets"("id") ON DELETE restrict ON UPDATE no action,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"lot_type" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"original_amount" numeric(36, 18) NOT NULL,
	"remaining_amount" numeric(36, 18) NOT NULL,
	"reserved_amount" numeric(36, 18) DEFAULT '0' NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reservation_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"credit_lot_id" text NOT NULL REFERENCES "credit_lots"("id") ON DELETE restrict ON UPDATE no action,
	"allocated_amount" numeric(36, 18) NOT NULL,
	"consumed_amount" numeric(36, 18),
	"released_amount" numeric(36, 18),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workspace_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE restrict ON UPDATE no action,
	"currency" text DEFAULT 'USD' NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"hard_limit" numeric(36, 18) NOT NULL,
	"warning_threshold" numeric(36, 18),
	"spent_in_period" numeric(36, 18) DEFAULT '0' NOT NULL,
	"reserved_in_period" numeric(36, 18) DEFAULT '0' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_authorization_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL UNIQUE,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE restrict ON UPDATE no action,
	"wallet_id" text,
	"reservation_id" text,
	"decision" text NOT NULL,
	"reason" text,
	"estimated_price" numeric(36, 18) NOT NULL,
	"required_reservation" numeric(36, 18) NOT NULL,
	"available_at_decision" numeric(36, 18),
	"currency" text DEFAULT 'USD' NOT NULL,
	"pricing_policy_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "settlement_shortfalls" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL REFERENCES "credit_wallets"("id") ON DELETE restrict ON UPDATE no action,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE restrict ON UPDATE no action,
	"reservation_id" text NOT NULL,
	"request_id" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reserved_amount" numeric(36, 18) NOT NULL,
	"final_customer_price" numeric(36, 18) NOT NULL,
	"shortfall_amount" numeric(36, 18) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "wallet_adjustment_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL REFERENCES "credit_wallets"("id") ON DELETE restrict ON UPDATE no action,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE restrict ON UPDATE no action,
	"amount" numeric(36, 18) NOT NULL,
	"direction" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reason" text NOT NULL,
	"reference" text NOT NULL,
	"created_by" text NOT NULL,
	"jit_grant_id" text,
	"ledger_entry_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_ledger_wallet_sequence_unique" ON "wallet_ledger_entries" ("wallet_id", "sequence");
CREATE INDEX IF NOT EXISTS "wallet_ledger_wallet_time_idx" ON "wallet_ledger_entries" ("wallet_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_ledger_reference_idx" ON "wallet_ledger_entries" ("reference_type", "reference_id");

CREATE INDEX IF NOT EXISTS "credit_lots_wallet_expiry_idx" ON "credit_lots" ("wallet_id", "expires_at");
CREATE INDEX IF NOT EXISTS "credit_lots_org_type_idx" ON "credit_lots" ("organization_id", "lot_type");

CREATE INDEX IF NOT EXISTS "reservation_allocations_res_idx" ON "reservation_allocations" ("reservation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_budgets_unique" ON "workspace_budgets" ("workspace_id", "period");
CREATE INDEX IF NOT EXISTS "workspace_budgets_org_idx" ON "workspace_budgets" ("organization_id");

CREATE INDEX IF NOT EXISTS "billing_auth_records_org_ws_idx" ON "billing_authorization_records" ("organization_id", "workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "settlement_shortfalls_org_status_idx" ON "settlement_shortfalls" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "wallet_adjustments_org_idx" ON "wallet_adjustment_logs" ("organization_id", "created_at");
