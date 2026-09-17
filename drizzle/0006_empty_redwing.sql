ALTER TABLE "horses" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jockeys" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jockeys" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "race_entries" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "race_entries" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ALTER COLUMN "available_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ALTER COLUMN "observed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "jockeys" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "jockeys" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "race_entries" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "race_entries" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "available_at_status" "observation_time_status";--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "observed_at_status" "observation_time_status";--> statement-breakpoint
-- Compatibility backfill only: known here means a timestamp is present, not that
-- the historical timestamp (including provisional 18:00 values) was verified.
-- Correct affected rows to unknown/NULL in a separate, reviewed operation.
UPDATE "horses" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "horses" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "jockeys" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "jockeys" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "race_entries" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "race_entries" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "race_results" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "race_results" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "races" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "races" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "trainers" SET "available_at_status" = 'known' WHERE "available_at" IS NOT NULL;--> statement-breakpoint
UPDATE "trainers" SET "observed_at_status" = 'known' WHERE "observed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jockeys" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jockeys" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "race_entries" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "race_entries" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ALTER COLUMN "available_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ALTER COLUMN "observed_at_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD CONSTRAINT "horses_available_time_status_check" CHECK ((
      ("horses"."available_at_status" = 'known' and "horses"."available_at" is not null) or
      ("horses"."available_at_status" = 'unknown' and "horses"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "horses" ADD CONSTRAINT "horses_observed_time_status_check" CHECK ((
      ("horses"."observed_at_status" = 'known' and "horses"."observed_at" is not null) or
      ("horses"."observed_at_status" = 'unknown' and "horses"."observed_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "jockeys" ADD CONSTRAINT "jockeys_available_time_status_check" CHECK ((
      ("jockeys"."available_at_status" = 'known' and "jockeys"."available_at" is not null) or
      ("jockeys"."available_at_status" = 'unknown' and "jockeys"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "jockeys" ADD CONSTRAINT "jockeys_observed_time_status_check" CHECK ((
      ("jockeys"."observed_at_status" = 'known' and "jockeys"."observed_at" is not null) or
      ("jockeys"."observed_at_status" = 'unknown' and "jockeys"."observed_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_available_time_status_check" CHECK ((
      ("race_entries"."available_at_status" = 'known' and "race_entries"."available_at" is not null) or
      ("race_entries"."available_at_status" = 'unknown' and "race_entries"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_observed_time_status_check" CHECK ((
      ("race_entries"."observed_at_status" = 'known' and "race_entries"."observed_at" is not null) or
      ("race_entries"."observed_at_status" = 'unknown' and "race_entries"."observed_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_available_time_status_check" CHECK ((
      ("race_results"."available_at_status" = 'known' and "race_results"."available_at" is not null) or
      ("race_results"."available_at_status" = 'unknown' and "race_results"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_observed_time_status_check" CHECK ((
      ("race_results"."observed_at_status" = 'known' and "race_results"."observed_at" is not null) or
      ("race_results"."observed_at_status" = 'unknown' and "race_results"."observed_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_available_time_status_check" CHECK ((
      ("races"."available_at_status" = 'known' and "races"."available_at" is not null) or
      ("races"."available_at_status" = 'unknown' and "races"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_observed_time_status_check" CHECK ((
      ("races"."observed_at_status" = 'known' and "races"."observed_at" is not null) or
      ("races"."observed_at_status" = 'unknown' and "races"."observed_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_available_time_status_check" CHECK ((
      ("trainers"."available_at_status" = 'known' and "trainers"."available_at" is not null) or
      ("trainers"."available_at_status" = 'unknown' and "trainers"."available_at" is null)
    ));--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_observed_time_status_check" CHECK ((
      ("trainers"."observed_at_status" = 'known' and "trainers"."observed_at" is not null) or
      ("trainers"."observed_at_status" = 'unknown' and "trainers"."observed_at" is null)
    ));
