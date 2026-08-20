-- Phase 23: Notification + Incident Delivery Platform Migration

CREATE TABLE IF NOT EXISTS notification_intents (
  id text PRIMARY KEY,
  source_event_id text NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id text REFERENCES workspaces(id) ON DELETE RESTRICT,
  category text NOT NULL,
  type text NOT NULL,
  priority text NOT NULL,
  preference_mode text NOT NULL,
  template_key text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_intents_source_type_unique ON notification_intents(source_event_id, type);
CREATE INDEX IF NOT EXISTS notification_intents_org_created_idx ON notification_intents(organization_id, created_at);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES notification_intents(id) ON DELETE CASCADE,
  recipient_id text,
  recipient_snapshot text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  template_key text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  provider text,
  provider_message_id text,
  scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
  first_attempt_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  next_attempt_at timestamp with time zone,
  lease_owner text,
  lease_expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_attempt_idx ON notification_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_priority_sched_idx ON notification_deliveries(priority, scheduled_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_idx ON notification_deliveries(recipient_snapshot, created_at);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id text PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  provider text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  provider_status text,
  provider_message_id text,
  error_category text,
  retryable boolean NOT NULL DEFAULT false,
  latency_ms integer
);
CREATE INDEX IF NOT EXISTS notification_attempts_delivery_idx ON notification_delivery_attempts(delivery_id, attempt_number);

CREATE TABLE IF NOT EXISTS notification_suppressions (
  id text PRIMARY KEY,
  destination text NOT NULL UNIQUE,
  reason text NOT NULL,
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS organization_notification_settings (
  organization_id text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  security_alerts_enabled boolean NOT NULL DEFAULT true,
  billing_alerts_enabled boolean NOT NULL DEFAULT true,
  usage_alerts_enabled boolean NOT NULL DEFAULT true,
  default_timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_escalations (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES notification_intents(id) ON DELETE CASCADE,
  signal_id text,
  organization_id text REFERENCES organizations(id) ON DELETE RESTRICT,
  escalation_count integer NOT NULL DEFAULT 0,
  max_escalations integer NOT NULL DEFAULT 1,
  next_escalation_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_escalations_status_time_idx ON notification_escalations(status, next_escalation_at);
