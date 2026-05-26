CREATE TABLE "pdf_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"dl_token" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"filters" jsonb NOT NULL,
	"sort" jsonb NOT NULL,
	"view_mode" text NOT NULL,
	"selected_sku_ids" jsonb,
	"total_rows" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"completed_chunks" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"azure_blob_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_jobs_dl_token_uidx" ON "pdf_generation_jobs" USING btree ("dl_token");--> statement-breakpoint
CREATE INDEX "pdf_jobs_status_idx" ON "pdf_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pdf_jobs_created_idx" ON "pdf_generation_jobs" USING btree ("created_at");