CREATE TABLE "canonical_models" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"display_name" text NOT NULL,
	"family" text NOT NULL,
	"category" text DEFAULT 'chat' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"customer_visible" boolean DEFAULT true NOT NULL,
	"routing_eligible" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"context_window" integer NOT NULL,
	"max_input_tokens" integer,
	"max_output_tokens" integer NOT NULL,
	"supports_streaming" boolean DEFAULT true NOT NULL,
	"supports_tools" boolean DEFAULT false NOT NULL,
	"supports_structured_output" boolean DEFAULT false NOT NULL,
	"supports_reasoning" boolean DEFAULT false NOT NULL,
	"input_modalities" jsonb DEFAULT '["text"]'::jsonb NOT NULL,
	"output_modalities" jsonb DEFAULT '["text"]'::jsonb NOT NULL,
	"reasoning_metadata" jsonb,
	"tool_metadata" jsonb,
	"structured_output_metadata" jsonb,
	"deprecated_at" timestamp with time zone,
	"sunset_at" timestamp with time zone,
	"replacement_model_id" text,
	"deprecation_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_models_canonical_id_unique" UNIQUE("canonical_id")
);
--> statement-breakpoint
CREATE TABLE "canonical_model_capabilities" (
	"model_id" text NOT NULL,
	"capability" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_model_capabilities_model_id_capability_pk" PRIMARY KEY("model_id","capability")
);
--> statement-breakpoint
CREATE TABLE "model_provider_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"routing_eligible" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"context_window_override" integer,
	"max_output_tokens_override" integer,
	"capabilities_overrides" jsonb,
	"pricing_reference" text,
	"available_from" timestamp with time zone,
	"deprecated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_model_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"canonical_model_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"type" text DEFAULT 'static' NOT NULL,
	"description" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_model_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "canonical_model_pricing" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text,
	"route_id" text,
	"pricing_type" text DEFAULT 'standard' NOT NULL,
	"input_price_per_million_minor" bigint NOT NULL,
	"output_price_per_million_minor" bigint NOT NULL,
	"cached_input_price_per_million_minor" bigint,
	"reasoning_price_per_million_minor" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canonical_model_capabilities" ADD CONSTRAINT "canonical_model_capabilities_model_id_canonical_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."canonical_models"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_provider_routes" ADD CONSTRAINT "model_provider_routes_model_id_canonical_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."canonical_models"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_provider_routes" ADD CONSTRAINT "model_provider_routes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canonical_model_pricing" ADD CONSTRAINT "canonical_model_pricing_model_id_canonical_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."canonical_models"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canonical_model_pricing" ADD CONSTRAINT "canonical_model_pricing_route_id_model_provider_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."model_provider_routes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_models_canonical_id_unique" ON "canonical_models" USING btree ("canonical_id");
--> statement-breakpoint
CREATE INDEX "canonical_models_status_idx" ON "canonical_models" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "canonical_models_family_idx" ON "canonical_models" USING btree ("family");
--> statement-breakpoint
CREATE INDEX "canonical_models_category_idx" ON "canonical_models" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "canonical_models_visibility_idx" ON "canonical_models" USING btree ("customer_visible","routing_eligible");
--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_routes_provider_model_region_unique" ON "model_provider_routes" USING btree ("provider_id","provider_model_id","region");
--> statement-breakpoint
CREATE INDEX "model_provider_routes_model_idx" ON "model_provider_routes" USING btree ("model_id");
--> statement-breakpoint
CREATE INDEX "model_provider_routes_status_idx" ON "model_provider_routes" USING btree ("status","routing_eligible");
--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_model_aliases_alias_unique" ON "canonical_model_aliases" USING btree ("alias");
--> statement-breakpoint
CREATE INDEX "canonical_model_aliases_target_idx" ON "canonical_model_aliases" USING btree ("canonical_model_id");
--> statement-breakpoint
CREATE INDEX "canonical_model_pricing_model_idx" ON "canonical_model_pricing" USING btree ("model_id","effective_from");
--> statement-breakpoint
CREATE INDEX "canonical_model_pricing_route_idx" ON "canonical_model_pricing" USING btree ("route_id","effective_from");
