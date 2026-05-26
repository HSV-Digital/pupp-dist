ALTER TABLE "pdf_generation_jobs" ADD COLUMN "created_by_entra_object_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ALTER COLUMN "created_by_entra_object_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "pdf_jobs_created_by_entra_object_id_idx" ON "pdf_generation_jobs" USING btree ("created_by_entra_object_id");
