CREATE TABLE IF NOT EXISTS "prompt_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'user_template' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'organization' NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_definitions_org_key_idx" ON "prompt_definitions" USING btree ("organization_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_definitions_org_status_idx" ON "prompt_definitions" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_definitions_org_ws_key_unique" ON "prompt_definitions" USING btree ("organization_id","workspace_id","key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL REFERENCES "prompt_definitions"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template" text,
	"template_format" text DEFAULT 'mustache' NOT NULL,
	"variable_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_schema" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"required_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_model_family" text,
	"allowed_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_prompt_version_unique" ON "prompt_versions" USING btree ("prompt_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_versions_prompt_hash_idx" ON "prompt_versions" USING btree ("prompt_id","content_hash");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prompt_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL REFERENCES "prompt_definitions"("id") ON DELETE cascade,
	"prompt_version_id" text NOT NULL REFERENCES "prompt_versions"("id") ON DELETE cascade,
	"environment" text DEFAULT 'production' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"release_number" integer DEFAULT 1 NOT NULL,
	"released_by" text NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rollback_from_release_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_releases_prompt_env_status_idx" ON "prompt_releases" USING btree ("prompt_id","environment","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_releases_version_idx" ON "prompt_releases" USING btree ("prompt_version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prompt_release_heads" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL REFERENCES "prompt_definitions"("id") ON DELETE cascade,
	"environment" text NOT NULL,
	"active_release_id" text NOT NULL REFERENCES "prompt_releases"("id") ON DELETE cascade,
	"active_version_id" text NOT NULL REFERENCES "prompt_versions"("id") ON DELETE cascade,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_release_heads_prompt_env_unique" ON "prompt_release_heads" USING btree ("prompt_id","environment");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prompt_execution_references" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL REFERENCES "gateway_requests"("id") ON DELETE cascade,
	"prompt_id" text NOT NULL REFERENCES "prompt_definitions"("id") ON DELETE cascade,
	"prompt_version_id" text NOT NULL REFERENCES "prompt_versions"("id") ON DELETE cascade,
	"prompt_release_id" text,
	"content_hash" text NOT NULL,
	"rendered_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_execution_references_request_idx" ON "prompt_execution_references" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_execution_references_prompt_version_idx" ON "prompt_execution_references" USING btree ("prompt_id","prompt_version_id");
