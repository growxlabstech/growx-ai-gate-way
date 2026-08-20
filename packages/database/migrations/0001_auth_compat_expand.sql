-- Expand-only Better Auth compatibility migration.
-- Existing sessions are not rewritten: unknown historical token semantics must
-- be revoked rather than relabeled or transformed unsafely.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "id_token_encrypted" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_expiry_idx" ON "verifications" USING btree ("expires_at");
--> statement-breakpoint
-- Better Auth does not understand GrowX's historical revoked_at column. Existing
-- rows may contain an unknown token representation, so the only fail-closed
-- migration is forced reauthentication. Do not relabel or transform them.
DELETE FROM "sessions";
