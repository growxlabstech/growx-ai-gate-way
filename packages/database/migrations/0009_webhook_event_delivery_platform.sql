-- Phase 21: Webhook + Event Delivery Platform Migration

-- 1. Outbound Webhook Events
CREATE TABLE IF NOT EXISTS "outbound_webhook_events" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
    "workspace_id" text REFERENCES "workspaces"("id") ON DELETE RESTRICT,
    "event_type" text NOT NULL,
    "event_version" text DEFAULT 'v1' NOT NULL,
    "source_event_id" text NOT NULL,
    "payload" jsonb NOT NULL,
    "payload_hash" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_events_source_unique" ON "outbound_webhook_events" ("source_event_id", "event_type", "event_version");
CREATE INDEX IF NOT EXISTS "outbound_events_org_created_idx" ON "outbound_webhook_events" ("organization_id", "created_at");

-- 2. Webhook Signing Secrets
CREATE TABLE IF NOT EXISTS "webhook_signing_secrets" (
    "id" text PRIMARY KEY NOT NULL,
    "endpoint_id" text NOT NULL REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE,
    "encrypted_secret" text NOT NULL,
    "key_version" integer DEFAULT 1 NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "webhook_secrets_endpoint_status_idx" ON "webhook_signing_secrets" ("endpoint_id", "status");

-- 3. Webhook Replay Jobs
CREATE TABLE IF NOT EXISTS "webhook_replay_jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
    "filter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "total_events" integer DEFAULT 0 NOT NULL,
    "replayed_events" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "webhook_replay_jobs_org_status_idx" ON "webhook_replay_jobs" ("organization_id", "status");
