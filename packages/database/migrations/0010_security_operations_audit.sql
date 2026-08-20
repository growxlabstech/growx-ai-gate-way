-- Phase 22: Security Operations + Audit Hardening Migration

CREATE TABLE IF NOT EXISTS audit_chain_heads (
  chain_scope text PRIMARY KEY,
  last_sequence integer NOT NULL DEFAULT 0,
  last_hash text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_integrity_checkpoints (
  id text PRIMARY KEY,
  chain_scope text NOT NULL,
  last_sequence integer NOT NULL,
  last_event_hash text NOT NULL,
  signed_hash text,
  key_version integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_checkpoints_scope_idx ON audit_integrity_checkpoints(chain_scope, created_at);

CREATE TABLE IF NOT EXISTS security_signals (
  id text PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  type text NOT NULL,
  severity text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'new',
  last_security_event_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_signals_org_status_idx ON security_signals(organization_id, status);
CREATE INDEX IF NOT EXISTS security_signals_severity_idx ON security_signals(severity, last_seen_at);

CREATE TABLE IF NOT EXISTS security_detection_rules (
  id text PRIMARY KEY,
  type text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  window_seconds integer NOT NULL,
  threshold integer NOT NULL,
  severity text NOT NULL,
  cooldown_seconds integer NOT NULL,
  scope text NOT NULL DEFAULT 'organization',
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_cases (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE RESTRICT,
  assigned_to text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_cases_org_status_idx ON security_cases(organization_id, status);
