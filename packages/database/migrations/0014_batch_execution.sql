-- Phase 26: Batch Inference + Async Job Execution Plane

DO $$ BEGIN
  CREATE TYPE "batch_job_status" AS ENUM (
    'validating', 'queued', 'running', 'finalizing', 'completed',
    'partially_completed', 'failed', 'cancelling', 'cancelled', 'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "batch_item_status" AS ENUM (
    'pending', 'queued', 'running', 'succeeded', 'failed', 'retry_wait', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "batch_chunk_status" AS ENUM (
    'pending', 'in_progress', 'completed', 'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "batch_reservation_status" AS ENUM (
    'reserved', 'partially_settled', 'settled', 'released'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "batch_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "input_file_id" text REFERENCES "files"("id") ON DELETE SET NULL,
  "output_file_id" text REFERENCES "files"("id") ON DELETE SET NULL,
  "error_file_id" text REFERENCES "files"("id") ON DELETE SET NULL,
  "endpoint" text NOT NULL DEFAULT '/v1/chat/completions',
  "status" "batch_job_status" NOT NULL DEFAULT 'validating',
  "completion_window" text NOT NULL DEFAULT '24h',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "total_items" integer NOT NULL DEFAULT 0,
  "pending_items" integer NOT NULL DEFAULT 0,
  "running_items" integer NOT NULL DEFAULT 0,
  "succeeded_items" integer NOT NULL DEFAULT 0,
  "failed_items" integer NOT NULL DEFAULT 0,
  "cancelled_items" integer NOT NULL DEFAULT 0,
  "error_summary" jsonb,
  "execution_deadline_at" timestamp with time zone,
  "validated_at" timestamp with time zone,
  "queued_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "batch_jobs_org_created_idx" ON "batch_jobs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "batch_jobs_ws_created_idx" ON "batch_jobs" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "batch_jobs_status_created_idx" ON "batch_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "batch_jobs_status_deadline_idx" ON "batch_jobs" ("status", "execution_deadline_at");

CREATE TABLE IF NOT EXISTS "batch_items" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "batch_jobs"("id") ON DELETE cascade,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "custom_id" text NOT NULL,
  "position" integer NOT NULL,
  "request_payload" jsonb NOT NULL,
  "request_hash" text,
  "status" "batch_item_status" NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "gateway_request_id" text,
  "response_payload" jsonb,
  "response_reference" text,
  "error_code" text,
  "error_message" text,
  "error_category" text,
  "retry_after_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_items_batch_custom_id_unique" ON "batch_items" ("batch_id", "custom_id");
CREATE UNIQUE INDEX IF NOT EXISTS "batch_items_batch_pos_unique" ON "batch_items" ("batch_id", "position");
CREATE INDEX IF NOT EXISTS "batch_items_batch_status_idx" ON "batch_items" ("batch_id", "status");
CREATE INDEX IF NOT EXISTS "batch_items_status_retry_idx" ON "batch_items" ("status", "retry_after_at");
CREATE INDEX IF NOT EXISTS "batch_items_org_status_idx" ON "batch_items" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "batch_item_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_item_id" text NOT NULL REFERENCES "batch_items"("id") ON DELETE cascade,
  "batch_id" text NOT NULL REFERENCES "batch_jobs"("id") ON DELETE cascade,
  "attempt_number" integer NOT NULL,
  "execution_id" text NOT NULL,
  "gateway_request_id" text,
  "status" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "retryable" boolean NOT NULL DEFAULT false,
  "latency_ms" integer,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_attempts_item_attempt_unique" ON "batch_item_attempts" ("batch_item_id", "attempt_number");
CREATE UNIQUE INDEX IF NOT EXISTS "batch_attempts_exec_unique" ON "batch_item_attempts" ("execution_id");
CREATE INDEX IF NOT EXISTS "batch_attempts_batch_idx" ON "batch_item_attempts" ("batch_id");

CREATE TABLE IF NOT EXISTS "batch_chunks" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "batch_jobs"("id") ON DELETE cascade,
  "sequence" integer NOT NULL,
  "status" "batch_chunk_status" NOT NULL DEFAULT 'pending',
  "item_count" integer NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_chunks_batch_seq_unique" ON "batch_chunks" ("batch_id", "sequence");
CREATE INDEX IF NOT EXISTS "batch_chunks_status_idx" ON "batch_chunks" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "batch_leases" (
  "id" text PRIMARY KEY NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "lease_owner" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "acquired_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_leases_type_res_unique" ON "batch_leases" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "batch_leases_expiry_idx" ON "batch_leases" ("expires_at");

CREATE TABLE IF NOT EXISTS "batch_execution_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "batch_jobs"("id") ON DELETE cascade,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "reserved_credits_amount" numeric(36, 18) NOT NULL,
  "settled_credits_amount" numeric(36, 18) NOT NULL DEFAULT '0',
  "status" "batch_reservation_status" NOT NULL DEFAULT 'reserved',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "settled_at" timestamp with time zone,
  "released_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_res_batch_unique" ON "batch_execution_reservations" ("batch_id");
CREATE INDEX IF NOT EXISTS "batch_res_org_idx" ON "batch_execution_reservations" ("organization_id");

CREATE TABLE IF NOT EXISTS "batch_idempotency_records" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "batch_id" text NOT NULL REFERENCES "batch_jobs"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "batch_idem_org_key_unique" ON "batch_idempotency_records" ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "batch_idem_expiry_idx" ON "batch_idempotency_records" ("expires_at");
