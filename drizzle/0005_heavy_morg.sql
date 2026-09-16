CREATE TYPE "public"."observation_time_status" AS ENUM('known', 'unknown');--> statement-breakpoint
CREATE TABLE "pre_race_entry_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pre_race_snapshot_id" uuid NOT NULL,
	"race_entry_id" uuid,
	"horse_id" uuid,
	"jockey_id" uuid,
	"trainer_id" uuid,
	"source_entry_key" text NOT NULL,
	"frame_number" smallint NOT NULL,
	"horse_number" smallint NOT NULL,
	"horse_name_raw" text NOT NULL,
	"jockey_name_raw" text NOT NULL,
	"trainer_name_raw" text,
	"sex" "horse_sex" NOT NULL,
	"age" smallint NOT NULL,
	"assigned_weight" numeric(4, 1) NOT NULL,
	"interval" integer,
	"zi" numeric(10, 3),
	"raw_fields_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pre_race_entry_snapshots_snapshot_horse_number_unique" UNIQUE("pre_race_snapshot_id","horse_number"),
	CONSTRAINT "pre_race_entry_snapshots_frame_number_check" CHECK ("pre_race_entry_snapshots"."frame_number" > 0),
	CONSTRAINT "pre_race_entry_snapshots_horse_number_check" CHECK ("pre_race_entry_snapshots"."horse_number" > 0),
	CONSTRAINT "pre_race_entry_snapshots_age_check" CHECK ("pre_race_entry_snapshots"."age" > 0),
	CONSTRAINT "pre_race_entry_snapshots_assigned_weight_check" CHECK ("pre_race_entry_snapshots"."assigned_weight" > 0),
	CONSTRAINT "pre_race_entry_snapshots_interval_check" CHECK ("pre_race_entry_snapshots"."interval" is null or "pre_race_entry_snapshots"."interval" >= 0),
	CONSTRAINT "pre_race_entry_snapshots_raw_fields_json_check" CHECK (jsonb_typeof("pre_race_entry_snapshots"."raw_fields_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "pre_race_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_code" text NOT NULL,
	"race_id" uuid,
	"source_race_key" text NOT NULL,
	"race_date" date NOT NULL,
	"venue" text NOT NULL,
	"race_number" smallint NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"surface" text NOT NULL,
	"distance_meters" integer NOT NULL,
	"declared_entries" integer NOT NULL,
	"observed_at" timestamp with time zone,
	"observation_time_status" "observation_time_status" NOT NULL,
	"schema_version" text NOT NULL,
	"source_file_name" text,
	"source_checksum" text,
	"snapshot_fingerprint" text NOT NULL,
	"is_feature_eligible" boolean NOT NULL,
	"eligibility_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pre_race_snapshots_fingerprint_unique" UNIQUE("snapshot_fingerprint"),
	CONSTRAINT "pre_race_snapshots_source_observed_version_unique" UNIQUE("provider_code","source_race_key","observed_at","schema_version"),
	CONSTRAINT "pre_race_snapshots_race_number_check" CHECK ("pre_race_snapshots"."race_number" > 0),
	CONSTRAINT "pre_race_snapshots_distance_meters_check" CHECK ("pre_race_snapshots"."distance_meters" > 0),
	CONSTRAINT "pre_race_snapshots_declared_entries_check" CHECK ("pre_race_snapshots"."declared_entries" > 0),
	CONSTRAINT "pre_race_snapshots_observation_time_check" CHECK (("pre_race_snapshots"."observation_time_status" = 'known' and "pre_race_snapshots"."observed_at" is not null) or ("pre_race_snapshots"."observation_time_status" = 'unknown' and "pre_race_snapshots"."observed_at" is null)),
	CONSTRAINT "pre_race_snapshots_known_before_start_check" CHECK ("pre_race_snapshots"."observation_time_status" <> 'known' or ("pre_race_snapshots"."observed_at" is not null and "pre_race_snapshots"."observed_at" < "pre_race_snapshots"."scheduled_start_at")),
	CONSTRAINT "pre_race_snapshots_feature_eligible_check" CHECK (not "pre_race_snapshots"."is_feature_eligible" or ("pre_race_snapshots"."observation_time_status" = 'known' and "pre_race_snapshots"."observed_at" is not null and "pre_race_snapshots"."observed_at" < "pre_race_snapshots"."scheduled_start_at")),
	CONSTRAINT "pre_race_snapshots_eligibility_reason_check" CHECK (("pre_race_snapshots"."is_feature_eligible" and "pre_race_snapshots"."eligibility_reason" is null) or (not "pre_race_snapshots"."is_feature_eligible" and "pre_race_snapshots"."eligibility_reason" is not null)),
	CONSTRAINT "pre_race_snapshots_fingerprint_check" CHECK ("pre_race_snapshots"."snapshot_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "pre_race_entry_snapshots" ADD CONSTRAINT "pre_race_entry_snapshots_pre_race_snapshot_id_pre_race_snapshots_id_fk" FOREIGN KEY ("pre_race_snapshot_id") REFERENCES "public"."pre_race_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_race_entry_snapshots" ADD CONSTRAINT "pre_race_entry_snapshots_race_entry_id_race_entries_id_fk" FOREIGN KEY ("race_entry_id") REFERENCES "public"."race_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_race_entry_snapshots" ADD CONSTRAINT "pre_race_entry_snapshots_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_race_entry_snapshots" ADD CONSTRAINT "pre_race_entry_snapshots_jockey_id_jockeys_id_fk" FOREIGN KEY ("jockey_id") REFERENCES "public"."jockeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_race_entry_snapshots" ADD CONSTRAINT "pre_race_entry_snapshots_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_race_snapshots" ADD CONSTRAINT "pre_race_snapshots_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pre_race_entry_snapshots_race_entry_idx" ON "pre_race_entry_snapshots" USING btree ("race_entry_id");--> statement-breakpoint
CREATE INDEX "pre_race_entry_snapshots_horse_idx" ON "pre_race_entry_snapshots" USING btree ("horse_id");--> statement-breakpoint
CREATE INDEX "pre_race_entry_snapshots_jockey_idx" ON "pre_race_entry_snapshots" USING btree ("jockey_id");--> statement-breakpoint
CREATE INDEX "pre_race_snapshots_race_observed_idx" ON "pre_race_snapshots" USING btree ("race_id","observed_at");