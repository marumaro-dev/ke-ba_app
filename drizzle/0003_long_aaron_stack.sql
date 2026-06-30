CREATE TYPE "public"."prediction_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."prediction_type" AS ENUM('rule_based');--> statement-breakpoint
CREATE TABLE "prediction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_type" "prediction_type" DEFAULT 'rule_based' NOT NULL,
	"model_version" text DEFAULT 'rule-v1' NOT NULL,
	"status" "prediction_run_status" DEFAULT 'running' NOT NULL,
	"mode" "import_mode" NOT NULL,
	"as_of_at" timestamp with time zone NOT NULL,
	"target_race_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"total_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_run_id" uuid NOT NULL,
	"prediction_type" "prediction_type" DEFAULT 'rule_based' NOT NULL,
	"model_version" text DEFAULT 'rule-v1' NOT NULL,
	"race_id" uuid NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"jockey_id" uuid,
	"as_of_at" timestamp with time zone NOT NULL,
	"prediction_score" numeric(6, 3) NOT NULL,
	"rank_in_race" integer,
	"score_components_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feature_snapshot_keys_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_predictions_type_version_entry_asof_unique" UNIQUE("prediction_type","model_version","race_entry_id","as_of_at")
);
--> statement-breakpoint
ALTER TABLE "prediction_runs" ADD CONSTRAINT "prediction_runs_target_race_id_races_id_fk" FOREIGN KEY ("target_race_id") REFERENCES "public"."races"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_prediction_run_id_prediction_runs_id_fk" FOREIGN KEY ("prediction_run_id") REFERENCES "public"."prediction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_race_entry_id_race_entries_id_fk" FOREIGN KEY ("race_entry_id") REFERENCES "public"."race_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_jockey_id_jockeys_id_fk" FOREIGN KEY ("jockey_id") REFERENCES "public"."jockeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_runs_started_at_idx" ON "prediction_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "prediction_runs_status_idx" ON "prediction_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prediction_runs_as_of_at_idx" ON "prediction_runs" USING btree ("as_of_at");--> statement-breakpoint
CREATE INDEX "race_predictions_run_idx" ON "race_predictions" USING btree ("prediction_run_id");--> statement-breakpoint
CREATE INDEX "race_predictions_race_idx" ON "race_predictions" USING btree ("race_id");