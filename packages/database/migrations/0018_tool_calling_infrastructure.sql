-- Migration 0018: Phase 30 Tool / Function Calling Infrastructure

CREATE TABLE IF NOT EXISTS "registered_tools" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "execution_mode" text DEFAULT 'return_to_client' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "visibility" text DEFAULT 'organization' NOT NULL,
  "active_version" integer DEFAULT 1 NOT NULL,
  "is_protected" boolean DEFAULT false NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "registered_tools_org_key_idx" ON "registered_tools" ("organization_id", "key");
CREATE INDEX IF NOT EXISTS "registered_tools_org_status_idx" ON "registered_tools" ("organization_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "registered_tools_org_ws_key_unique" ON "registered_tools" ("organization_id", "workspace_id", "key");

CREATE TABLE IF NOT EXISTS "registered_tool_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "tool_id" text NOT NULL REFERENCES "registered_tools"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "description" text,
  "input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_schema" jsonb,
  "execution_mode" text DEFAULT 'return_to_client' NOT NULL,
  "required_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "registered_tool_versions_tool_version_unique" ON "registered_tool_versions" ("tool_id", "version");
CREATE INDEX IF NOT EXISTS "registered_tool_versions_tool_hash_idx" ON "registered_tool_versions" ("tool_id", "content_hash");

CREATE TABLE IF NOT EXISTS "tool_call_records" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL REFERENCES "gateway_requests"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider_call_id" text,
  "name" text NOT NULL,
  "arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "raw_arguments" text,
  "status" text DEFAULT 'requested' NOT NULL,
  "arguments_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_call_records_request_idx" ON "tool_call_records" ("request_id");
CREATE INDEX IF NOT EXISTS "tool_call_records_org_created_idx" ON "tool_call_records" ("organization_id", "created_at");

CREATE TABLE IF NOT EXISTS "tool_continuation_states" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL REFERENCES "gateway_requests"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider_id" text NOT NULL,
  "route_id" text NOT NULL,
  "model_id" text NOT NULL,
  "prompt_version_id" text,
  "provider_state_reference" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_continuation_states_request_idx" ON "tool_continuation_states" ("request_id");
CREATE INDEX IF NOT EXISTS "tool_continuation_states_org_status_idx" ON "tool_continuation_states" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "tool_continuation_states_expiry_idx" ON "tool_continuation_states" ("expires_at");

CREATE TABLE IF NOT EXISTS "tool_execution_records" (
  "id" text PRIMARY KEY NOT NULL,
  "tool_call_id" text NOT NULL REFERENCES "tool_call_records"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'executing' NOT NULL,
  "side_effect_class" text DEFAULT 'read_only' NOT NULL,
  "idempotency_key" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error_code" text,
  "result_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_execution_records_call_idx" ON "tool_execution_records" ("tool_call_id");
CREATE INDEX IF NOT EXISTS "tool_execution_records_org_status_idx" ON "tool_execution_records" ("organization_id", "status");
