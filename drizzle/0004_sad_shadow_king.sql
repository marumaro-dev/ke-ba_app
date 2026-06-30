CREATE TABLE "prediction_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_run_id" uuid NOT NULL,
	"race_prediction_id" uuid NOT NULL,
	"race_id" uuid NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"predicted_rank" integer,
	"prediction_score" numeric(6, 3) NOT NULL,
	"finish_position" integer,
	"finish_status" "finish_status",
	"is_predicted_top1" boolean DEFAULT false NOT NULL,
	"top_prediction_finish_position" integer,
	"top_prediction_is_top3" boolean,
	"is_actual_winner" boolean DEFAULT false NOT NULL,
	"actual_winner_in_predicted_top3" boolean NOT NULL,
	"rank_diff" integer,
	"result_available_at" timestamp with time zone NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_evaluations_prediction_unique" UNIQUE("race_prediction_id")
);
--> statement-breakpoint
ALTER TABLE "prediction_evaluations" ADD CONSTRAINT "prediction_evaluations_prediction_run_id_prediction_runs_id_fk" FOREIGN KEY ("prediction_run_id") REFERENCES "public"."prediction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_evaluations" ADD CONSTRAINT "prediction_evaluations_race_prediction_id_race_predictions_id_fk" FOREIGN KEY ("race_prediction_id") REFERENCES "public"."race_predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_evaluations" ADD CONSTRAINT "prediction_evaluations_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_evaluations" ADD CONSTRAINT "prediction_evaluations_race_entry_id_race_entries_id_fk" FOREIGN KEY ("race_entry_id") REFERENCES "public"."race_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_evaluations_run_idx" ON "prediction_evaluations" USING btree ("prediction_run_id");--> statement-breakpoint
CREATE INDEX "prediction_evaluations_race_idx" ON "prediction_evaluations" USING btree ("race_id");