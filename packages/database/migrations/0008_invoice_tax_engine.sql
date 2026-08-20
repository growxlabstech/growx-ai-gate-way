-- Phase 20: Invoice + Tax + GST/VAT Engine Migration

DO $$ BEGIN
    CREATE TYPE "tax_regime" AS ENUM ('INDIA_GST', 'EU_VAT', 'UK_VAT', 'US_SALES_TAX', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "tax_treatment" AS ENUM ('standard', 'zero_rated', 'exempt', 'reverse_charge', 'out_of_scope');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "credit_note_status" AS ENUM ('issued', 'applied', 'void');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Legal Entities (Sellers)
CREATE TABLE IF NOT EXISTS "legal_entities" (
    "id" text PRIMARY KEY NOT NULL,
    "code" text NOT NULL UNIQUE,
    "legal_name" text NOT NULL,
    "country" text NOT NULL,
    "state_region" text,
    "registered_address" jsonb NOT NULL,
    "tax_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "invoice_prefix" text,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Customer Billing Profiles
CREATE TABLE IF NOT EXISTS "customer_billing_profiles" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
    "legal_name" text NOT NULL,
    "billing_email" text,
    "country" text NOT NULL,
    "state_region" text,
    "postal_code" text,
    "city" text,
    "address_line1" text NOT NULL,
    "address_line2" text,
    "tax_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "billing_currency" text DEFAULT 'USD' NOT NULL,
    "tax_exemption_status" text DEFAULT 'none' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "customer_billing_profiles_org_idx" ON "customer_billing_profiles" ("organization_id");

-- 3. Snapshots
CREATE TABLE IF NOT EXISTS "invoice_legal_entity_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "legal_entity_id" text NOT NULL,
    "code" text NOT NULL,
    "legal_name" text NOT NULL,
    "country" text NOT NULL,
    "state_region" text,
    "registered_address" jsonb NOT NULL,
    "tax_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "invoice_prefix" text,
    "snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoice_billing_profile_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "legal_name" text NOT NULL,
    "billing_email" text,
    "country" text NOT NULL,
    "state_region" text,
    "postal_code" text,
    "city" text,
    "address_line1" text NOT NULL,
    "address_line2" text,
    "tax_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "tax_exemption_status" text,
    "snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Tax Rules
CREATE TABLE IF NOT EXISTS "tax_rules" (
    "id" text PRIMARY KEY NOT NULL,
    "regime" "tax_regime" NOT NULL,
    "jurisdiction" text NOT NULL,
    "supply_type" text,
    "customer_type" text,
    "product_tax_code" text,
    "tax_type" text NOT NULL,
    "rate" numeric(36, 18) NOT NULL,
    "effective_from" timestamp with time zone NOT NULL,
    "effective_to" timestamp with time zone,
    "status" text DEFAULT 'active' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tax_rules_regime_jurisdiction_idx" ON "tax_rules" ("regime", "jurisdiction", "status");

-- 5. Invoice Sequences
CREATE TABLE IF NOT EXISTS "invoice_sequences" (
    "id" text PRIMARY KEY NOT NULL,
    "legal_entity_id" text NOT NULL REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
    "fiscal_year" text NOT NULL,
    "next_sequence" bigint DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_sequences_entity_fy_unique" ON "invoice_sequences" ("legal_entity_id", "fiscal_year");

-- 6. Invoice Tax Lines
CREATE TABLE IF NOT EXISTS "invoice_tax_lines" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
    "line_number" integer NOT NULL,
    "tax_type" text NOT NULL,
    "rate" numeric(36, 18) NOT NULL,
    "taxable_amount" numeric(36, 18) NOT NULL,
    "tax_amount" numeric(36, 18) NOT NULL,
    "jurisdiction" text NOT NULL,
    "rule_id" text,
    "description" text NOT NULL,
    "sac_hsn_code" text
);
CREATE INDEX IF NOT EXISTS "invoice_tax_lines_invoice_idx" ON "invoice_tax_lines" ("invoice_id");

-- 7. Payment Allocations
CREATE TABLE IF NOT EXISTS "invoice_payment_allocations" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
    "payment_id" text NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
    "amount" numeric(36, 18) NOT NULL,
    "currency" text NOT NULL,
    "allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "idempotency_key" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payment_allocations_inv_pay_unique" ON "invoice_payment_allocations" ("invoice_id", "payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payment_allocations_idempotency_unique" ON "invoice_payment_allocations" ("idempotency_key");

-- 8. Credit Notes & Lines
CREATE TABLE IF NOT EXISTS "credit_notes" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
    "legal_entity_id" text NOT NULL REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
    "credit_note_number" text NOT NULL UNIQUE,
    "original_invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
    "status" "credit_note_status" DEFAULT 'issued' NOT NULL,
    "currency" text NOT NULL,
    "subtotal" numeric(36, 18) NOT NULL,
    "tax_total" numeric(36, 18) DEFAULT '0' NOT NULL,
    "total" numeric(36, 18) NOT NULL,
    "amount_allocated" numeric(36, 18) DEFAULT '0' NOT NULL,
    "reason" text NOT NULL,
    "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "credit_notes_org_status_idx" ON "credit_notes" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "credit_notes_original_invoice_idx" ON "credit_notes" ("original_invoice_id");

CREATE TABLE IF NOT EXISTS "credit_note_lines" (
    "id" text PRIMARY KEY NOT NULL,
    "credit_note_id" text NOT NULL REFERENCES "credit_notes"("id") ON DELETE RESTRICT,
    "line_number" integer NOT NULL,
    "description" text NOT NULL,
    "quantity" bigint DEFAULT 1 NOT NULL,
    "unit_price" numeric(36, 18) NOT NULL,
    "subtotal" numeric(36, 18) NOT NULL,
    "tax_amount" numeric(36, 18) DEFAULT '0' NOT NULL,
    "total" numeric(36, 18) NOT NULL
);
CREATE INDEX IF NOT EXISTS "credit_note_lines_credit_note_idx" ON "credit_note_lines" ("credit_note_id");

-- 9. Invoice Documents
CREATE TABLE IF NOT EXISTS "invoice_documents" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
    "version" integer DEFAULT 1 NOT NULL,
    "template_version" text NOT NULL,
    "format" text DEFAULT 'html' NOT NULL,
    "storage_key" text NOT NULL,
    "sha256_hash" text NOT NULL,
    "byte_size" integer NOT NULL,
    "status" text DEFAULT 'generated' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_documents_invoice_version_unique" ON "invoice_documents" ("invoice_id", "version");
CREATE INDEX IF NOT EXISTS "invoice_documents_invoice_idx" ON "invoice_documents" ("invoice_id");
