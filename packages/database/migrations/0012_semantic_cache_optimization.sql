-- Phase 24: Semantic Cache & Request Optimization Platform Migration

CREATE TABLE IF NOT EXISTS semantic_cache_entries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  namespace_hash text NOT NULL,
  request_fingerprint text NOT NULL,
  semantic_text_hash text NOT NULL,
  embedding jsonb NOT NULL,
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL,
  canonical_model text NOT NULL,
  model_compatibility_group text,
  system_prompt_hash text NOT NULL,
  policy_version integer NOT NULL DEFAULT 1,
  cache_policy_version integer NOT NULL DEFAULT 1,
  parameters_hash text NOT NULL,
  response_format_hash text,
  response_payload jsonb NOT NULL,
  response_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  last_hit_at timestamp with time zone,
  hit_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS semantic_cache_org_ws_ns_idx ON semantic_cache_entries(organization_id, workspace_id, namespace_hash);
CREATE INDEX IF NOT EXISTS semantic_cache_expiry_status_idx ON semantic_cache_entries(expires_at, status);

CREATE TABLE IF NOT EXISTS semantic_cache_policies (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  similarity_threshold text NOT NULL DEFAULT '0.8500',
  ttl_seconds integer NOT NULL DEFAULT 86400,
  max_entry_size_bytes integer NOT NULL DEFAULT 524288,
  shadow_mode boolean NOT NULL DEFAULT false,
  allowed_models jsonb NOT NULL DEFAULT '[]',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  text_hash text NOT NULL,
  embedding jsonb NOT NULL,
  embedding_model text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS semantic_embeddings_org_hash_unique ON semantic_embeddings(organization_id, text_hash);
