CREATE TYPE "public"."entry_status" AS ENUM('entered', 'running', 'scratched', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."finish_status" AS ENUM('finished', 'did_not_finish', 'disqualified', 'scratched');--> statement-breakpoint
CREATE TYPE "public"."horse_sex" AS ENUM('male', 'female', 'gelding');--> statement-breakpoint
CREATE TYPE "public"."race_status" AS ENUM('scheduled', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('preliminary', 'confirmed', 'corrected');--> statement-breakpoint
CREATE TABLE "horses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"birth_date" date,
	"sex" "horse_sex",
	"color" text,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jockeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"jockey_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"frame_number" smallint NOT NULL,
	"horse_number" smallint NOT NULL,
	"assigned_weight" numeric(4, 1) NOT NULL,
	"body_weight" integer,
	"body_weight_diff" integer,
	"status" "entry_status" DEFAULT 'entered' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_entries_race_horse_unique" UNIQUE("race_id","horse_id"),
	CONSTRAINT "race_entries_race_horse_number_unique" UNIQUE("race_id","horse_number"),
	CONSTRAINT "race_entries_frame_number_check" CHECK ("race_entries"."frame_number" between 1 and 8),
	CONSTRAINT "race_entries_horse_number_check" CHECK ("race_entries"."horse_number" between 1 and 99),
	CONSTRAINT "race_entries_assigned_weight_check" CHECK ("race_entries"."assigned_weight" > 0),
	CONSTRAINT "race_entries_body_weight_check" CHECK ("race_entries"."body_weight" is null or "race_entries"."body_weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_entry_id" uuid NOT NULL,
	"finish_position" smallint,
	"finish_status" "finish_status" DEFAULT 'finished' NOT NULL,
	"finish_time_milliseconds" integer,
	"margin" text,
	"final_odds" numeric(8, 1),
	"popularity" smallint,
	"status" "result_status" DEFAULT 'preliminary' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_results_race_entry_unique" UNIQUE("race_entry_id"),
	CONSTRAINT "race_results_finish_position_check" CHECK ("race_results"."finish_position" is null or "race_results"."finish_position" > 0),
	CONSTRAINT "race_results_finish_time_check" CHECK ("race_results"."finish_time_milliseconds" is null or "race_results"."finish_time_milliseconds" > 0),
	CONSTRAINT "race_results_final_odds_check" CHECK ("race_results"."final_odds" is null or "race_results"."final_odds" > 0),
	CONSTRAINT "race_results_popularity_check" CHECK ("race_results"."popularity" is null or "race_results"."popularity" > 0)
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_date" date NOT NULL,
	"venue" text NOT NULL,
	"race_number" smallint NOT NULL,
	"name" text NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"surface" text NOT NULL,
	"distance_meters" integer NOT NULL,
	"weather" text,
	"track_condition" text,
	"status" "race_status" DEFAULT 'scheduled' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "races_date_venue_number_unique" UNIQUE("race_date","venue","race_number"),
	CONSTRAINT "races_race_number_check" CHECK ("races"."race_number" between 1 and 99),
	CONSTRAINT "races_distance_meters_check" CHECK ("races"."distance_meters" > 0)
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"affiliation" text,
	"available_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_jockey_id_jockeys_id_fk" FOREIGN KEY ("jockey_id") REFERENCES "public"."jockeys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_race_entry_id_race_entries_id_fk" FOREIGN KEY ("race_entry_id") REFERENCES "public"."race_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "race_entries_horse_id_idx" ON "race_entries" USING btree ("horse_id");--> statement-breakpoint
CREATE INDEX "races_scheduled_start_at_idx" ON "races" USING btree ("scheduled_start_at");