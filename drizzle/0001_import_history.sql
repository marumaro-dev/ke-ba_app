CREATE TYPE "public"."import_batch_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_mode" AS ENUM('dry_run', 'import');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_code" text NOT NULL,
	"import_type" text NOT NULL,
	"mode" "import_mode" NOT NULL,
	"status" "import_batch_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"source_dir" text NOT NULL,
	"summary_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"row_number" integer,
	"entity_type" text,
	"source_id" text,
	"error_code" text NOT NULL,
	"error_message" text NOT NULL,
	"raw_row_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_started_at_idx" ON "import_batches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_errors_batch_id_idx" ON "import_errors" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "import_errors_file_row_idx" ON "import_errors" USING btree ("file_name","row_number");