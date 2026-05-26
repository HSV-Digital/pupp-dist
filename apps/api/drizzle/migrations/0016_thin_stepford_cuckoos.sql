ALTER TABLE "pdf_generation_jobs" ADD COLUMN "org_id" text;--> statement-breakpoint
CREATE INDEX "pdf_jobs_org_id_idx" ON "pdf_generation_jobs" USING btree ("org_id");