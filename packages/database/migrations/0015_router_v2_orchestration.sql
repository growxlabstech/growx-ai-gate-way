-- Phase 27: Model Router V2 + Intelligent Traffic Orchestration Migration

DO $$ BEGIN
  CREATE TYPE "public"."routing_workload_type" AS ENUM(
    'realtime_interactive',
    'realtime_background',
    'batch',
    'embedding',
    'image',
    'audio',
    'document',
    'reasoning',
    'tool_call',
    'structured_generation'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."routing_latency_class" AS ENUM(
    'ultra_low',
    'interactive',
    'standard',
    'throughput'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."routing_objective" AS ENUM(
    'balanced',
    'lowest_latency',
    'lowest_cost',
    'highest_reliability',
    'highest_throughput',
    'pinned',
    'custom_policy'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."traffic_control_mode" AS ENUM(
    'active',
    'draining',
    'disabled',
    'canary'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "route_traffic_controls" (
  "id" text PRIMARY KEY NOT NULL,
  "route_id" text NOT NULL REFERENCES "model_provider_routes"("id") ON DELETE CASCADE,
  "mode" "traffic_control_mode" NOT NULL DEFAULT 'active',
  "max_traffic_percent" integer NOT NULL DEFAULT 100,
  "drain" boolean NOT NULL DEFAULT false,
  "disabled" boolean NOT NULL DEFAULT false,
  "reason" text,
  "updated_by" text,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "route_traffic_controls_route_unique" ON "route_traffic_controls" ("route_id");
CREATE INDEX IF NOT EXISTS "route_traffic_controls_mode_idx" ON "route_traffic_controls" ("mode");

CREATE TABLE IF NOT EXISTS "provider_credential_pools" (
  "id" text PRIMARY KEY NOT NULL,
  "provider_id" text NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'production',
  "status" text NOT NULL DEFAULT 'active',
  "account_limit_rpm" integer,
  "account_limit_tpm" integer,
  "account_limit_concurrency" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "provider_credential_pools_provider_idx" ON "provider_credential_pools" ("provider_id", "status");

CREATE TABLE IF NOT EXISTS "routing_decisions_v2" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "router_version" text NOT NULL DEFAULT 'v2',
  "policy_version" integer NOT NULL DEFAULT 1,
  "objective" "routing_objective" NOT NULL DEFAULT 'balanced',
  "request_profile_hash" text NOT NULL,
  "selected_route_id" text NOT NULL REFERENCES "model_provider_routes"("id") ON DELETE RESTRICT,
  "selected_rank" integer NOT NULL DEFAULT 1,
  "candidate_count" integer NOT NULL DEFAULT 1,
  "decision_reason" text NOT NULL,
  "shadow_decision" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "routing_decisions_v2_request_idx" ON "routing_decisions_v2" ("request_id");
CREATE INDEX IF NOT EXISTS "routing_decisions_v2_tenant_idx" ON "routing_decisions_v2" ("organization_id", "workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "routing_candidate_decisions" (
  "id" text PRIMARY KEY NOT NULL,
  "routing_decision_id" text NOT NULL REFERENCES "routing_decisions_v2"("id") ON DELETE CASCADE,
  "route_id" text NOT NULL REFERENCES "model_provider_routes"("id") ON DELETE CASCADE,
  "eligible" boolean NOT NULL,
  "rejection_reason" text,
  "total_score" numeric(5, 2),
  "rank" integer,
  "scores" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "snapshot_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "routing_candidate_decisions_decision_idx" ON "routing_candidate_decisions" ("routing_decision_id");

CREATE TABLE IF NOT EXISTS "routing_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "version" integer NOT NULL,
  "snapshot_payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "routing_snapshots_version_unique" ON "routing_snapshots" ("version");
CREATE INDEX IF NOT EXISTS "routing_snapshots_expiry_idx" ON "routing_snapshots" ("expires_at");
