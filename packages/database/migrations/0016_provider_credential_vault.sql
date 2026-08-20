CREATE TABLE IF NOT EXISTS "provider_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL REFERENCES "providers"("id") ON DELETE cascade,
	"display_name" text NOT NULL,
	"external_account_reference" text,
	"account_type" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"region" text,
	"residency" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"disabled_at" timestamp with time zone,
	"draining_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_accounts_provider_idx" ON "provider_accounts" USING btree ("provider_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_accounts_env_idx" ON "provider_accounts" USING btree ("environment");
--> statement-breakpoint

ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "provider_account_id" text REFERENCES "provider_accounts"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "credential_type" text DEFAULT 'api_key' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "active_version_id" text;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_credential_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL REFERENCES "provider_credentials"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"secret_reference" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"validation_status" text DEFAULT 'unknown' NOT NULL,
	"validated_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credential_versions_cred_ver_unique" ON "provider_credential_versions" USING btree ("credential_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credential_versions_secret_ref_idx" ON "provider_credential_versions" USING btree ("secret_reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credential_versions_status_idx" ON "provider_credential_versions" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_credential_pool_members" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL REFERENCES "provider_credential_pools"("id") ON DELETE cascade,
	"provider_account_id" text NOT NULL REFERENCES "provider_accounts"("id") ON DELETE cascade,
	"credential_id" text NOT NULL REFERENCES "provider_credentials"("id") ON DELETE cascade,
	"weight" integer DEFAULT 100 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"max_concurrency" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credential_pool_members_unique" ON "provider_credential_pool_members" USING btree ("pool_id","provider_account_id","credential_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credential_pool_members_pool_idx" ON "provider_credential_pool_members" USING btree ("pool_id","status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_account_capabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_account_id" text NOT NULL REFERENCES "provider_accounts"("id") ON DELETE cascade,
	"canonical_model_id" text,
	"provider_model_id" text,
	"capability" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_account_capabilities_account_idx" ON "provider_account_capabilities" USING btree ("provider_account_id","capability");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_account_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_account_id" text NOT NULL REFERENCES "provider_accounts"("id") ON DELETE cascade,
	"canonical_model_id" text,
	"limit_type" text NOT NULL,
	"limit_value" bigint NOT NULL,
	"window_seconds" integer,
	"source" text DEFAULT 'configured' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_account_limits_account_idx" ON "provider_account_limits" USING btree ("provider_account_id","limit_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credential_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_version_id" text NOT NULL REFERENCES "provider_credential_versions"("id") ON DELETE cascade,
	"status" text NOT NULL,
	"latency_ms" integer,
	"safe_error_code" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credential_validations_version_idx" ON "credential_validations" USING btree ("credential_version_id","checked_at");
