CREATE TYPE "public"."feature_generation_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feature_value_type" AS ENUM('number', 'boolean', 'string', 'json');--> statement-breakpoint
CREATE TABLE "feature_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"entity_type" text NOT NULL,
	"value_type" "feature_value_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"calculation_logic" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_definitions_key_version_unique" UNIQUE("feature_key","version")
);
--> statement-breakpoint
CREATE TABLE "feature_generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "feature_generation_status" DEFAULT 'running' NOT NULL,
	"mode" "import_mode" NOT NULL,
	"as_of_at" timestamp with time zone NOT NULL,
	"feature_version" integer DEFAULT 1 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_definition_id" uuid NOT NULL,
	"generation_batch_id" uuid,
	"race_id" uuid NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"jockey_id" uuid,
	"feature_key" text NOT NULL,
	"feature_version" integer DEFAULT 1 NOT NULL,
	"as_of_at" timestamp with time zone NOT NULL,
	"feature_value_number" numeric(18, 6),
	"feature_value_text" text,
	"feature_value_boolean" boolean,
	"feature_value_json" jsonb,
	"source_available_until" timestamp with time zone,
	"source_observed_until" timestamp with time zone,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_snapshots_key_entry_asof_unique" UNIQUE("feature_key","feature_version","race_entry_id","as_of_at")
);
--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_feature_definition_id_feature_definitions_id_fk" FOREIGN KEY ("feature_definition_id") REFERENCES "public"."feature_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_generation_batch_id_feature_generation_batches_id_fk" FOREIGN KEY ("generation_batch_id") REFERENCES "public"."feature_generation_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_race_entry_id_race_entries_id_fk" FOREIGN KEY ("race_entry_id") REFERENCES "public"."race_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_jockey_id_jockeys_id_fk" FOREIGN KEY ("jockey_id") REFERENCES "public"."jockeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_generation_batches_started_at_idx" ON "feature_generation_batches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "feature_generation_batches_status_idx" ON "feature_generation_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feature_snapshots_race_entry_idx" ON "feature_snapshots" USING btree ("race_entry_id");--> statement-breakpoint
CREATE INDEX "feature_snapshots_as_of_at_idx" ON "feature_snapshots" USING btree ("as_of_at");