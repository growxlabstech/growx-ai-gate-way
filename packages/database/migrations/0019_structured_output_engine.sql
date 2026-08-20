-- Phase 31: Structured Output + Response Schema Engine
-- Migration: 0019_structured_output_engine.sql

-- Response Schema Registry
CREATE TABLE response_schemas (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  visibility TEXT NOT NULL DEFAULT 'organization',
  active_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX response_schemas_org_key_idx ON response_schemas(organization_id, key);
CREATE INDEX response_schemas_org_status_idx ON response_schemas(organization_id, status);

-- Response Schema Versions (immutable)
CREATE TABLE response_schema_versions (
  id TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL REFERENCES response_schemas(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  schema JSONB NOT NULL,
  schema_hash TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schema_id, version)
);

CREATE INDEX response_schema_versions_hash_idx ON response_schema_versions(schema_hash);
