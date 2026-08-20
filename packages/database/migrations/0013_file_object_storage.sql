-- Phase 25: File & Object Storage Infrastructure Migration

DO $$ BEGIN
  CREATE TYPE file_status AS ENUM ('pending_upload', 'uploading', 'uploaded', 'processing', 'ready', 'rejected', 'quarantined', 'deleting', 'deleted', 'expired', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_purpose AS ENUM ('ai_input', 'image_input', 'audio_input', 'document_input', 'batch_input', 'batch_output', 'invoice_document', 'generated_artifact', 'provider_transfer', 'internal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_safety_state AS ENUM ('not_scanned', 'pending', 'clean', 'rejected', 'quarantined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_upload_session_status AS ENUM ('pending', 'active', 'completed', 'aborted', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_upload_type AS ENUM ('single', 'multipart');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_provider_reference_status AS ENUM ('pending', 'ready', 'expired', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS files (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
  purpose file_purpose NOT NULL,
  status file_status NOT NULL DEFAULT 'pending_upload',
  storage_provider text NOT NULL DEFAULT 'memory',
  bucket text,
  storage_key text NOT NULL,
  original_file_name text NOT NULL,
  safe_file_name text NOT NULL,
  mime_type text NOT NULL,
  detected_mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text,
  etag text,
  encryption_state text NOT NULL DEFAULT 'provider_encrypted',
  safety_state file_safety_state NOT NULL DEFAULT 'not_scanned',
  metadata jsonb NOT NULL DEFAULT '{}',
  uploaded_at timestamp with time zone,
  ready_at timestamp with time zone,
  expires_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS files_storage_key_unique ON files(storage_key);
CREATE INDEX IF NOT EXISTS files_org_created_idx ON files(organization_id, created_at);
CREATE INDEX IF NOT EXISTS files_ws_created_idx ON files(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS files_status_expiry_idx ON files(status, expires_at);
CREATE INDEX IF NOT EXISTS files_purpose_idx ON files(purpose);

CREATE TABLE IF NOT EXISTS file_upload_sessions (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status file_upload_session_status NOT NULL DEFAULT 'pending',
  upload_type file_upload_type NOT NULL DEFAULT 'single',
  multipart_upload_id text,
  part_count integer,
  expires_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_upload_sessions_file_idx ON file_upload_sessions(file_id);
CREATE INDEX IF NOT EXISTS file_upload_sessions_org_idx ON file_upload_sessions(organization_id);
CREATE INDEX IF NOT EXISTS file_upload_sessions_expiry_status_idx ON file_upload_sessions(expires_at, status);

CREATE TABLE IF NOT EXISTS file_provider_references (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  provider_credential_id text,
  provider_file_id text NOT NULL,
  provider_status file_provider_reference_status NOT NULL DEFAULT 'ready',
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_provider_refs_file_idx ON file_provider_references(file_id);
CREATE INDEX IF NOT EXISTS file_provider_refs_prov_file_idx ON file_provider_references(provider_file_id);
CREATE UNIQUE INDEX IF NOT EXISTS file_provider_refs_unique ON file_provider_references(file_id, provider_id, provider_credential_id);

CREATE TABLE IF NOT EXISTS file_usage_references (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_usage_refs_file_idx ON file_usage_references(file_id);
CREATE INDEX IF NOT EXISTS file_usage_refs_type_id_idx ON file_usage_references(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS file_storage_reservations (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reserved_bytes bigint NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_storage_reservations_org_idx ON file_storage_reservations(organization_id);
CREATE INDEX IF NOT EXISTS file_storage_reservations_expiry_idx ON file_storage_reservations(expires_at);

CREATE TABLE IF NOT EXISTS file_retention_policies (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  purpose file_purpose NOT NULL,
  retention_seconds integer,
  permanent boolean NOT NULL DEFAULT false,
  deletion_mode text NOT NULL DEFAULT 'soft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_retention_policies_org_purpose_idx ON file_retention_policies(organization_id, purpose);
