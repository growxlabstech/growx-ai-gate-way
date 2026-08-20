ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "api_version" text;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "provider_id" text REFERENCES "public"."providers"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "name" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "encrypted_payload" text;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "encryption_key_version" text DEFAULT 'v1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "rotated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credentials_provider_idx" ON "provider_credentials" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credentials_status_idx" ON "provider_credentials" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_credentials_env_idx" ON "provider_credentials" USING btree ("environment");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_provider_name_env_unique" ON "provider_credentials" USING btree ("provider_id","name","environment");
