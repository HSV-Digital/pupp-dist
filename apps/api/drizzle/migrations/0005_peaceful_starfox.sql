ALTER TABLE "pdf_generation_jobs" ADD COLUMN "part_size" integer DEFAULT 25000 NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD COLUMN "total_parts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD COLUMN "completed_parts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD COLUMN "parts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "pdf_generation_jobs"
SET
	"total_parts" = GREATEST("total_chunks", 0),
	"completed_parts" = LEAST(
		GREATEST("completed_chunks", 0),
		GREATEST("total_chunks", 0)
	);
