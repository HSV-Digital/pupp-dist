ALTER TABLE "pdf_generation_jobs" ADD COLUMN "pdf_password_ciphertext" text;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD COLUMN "pdf_password_revealed_at" timestamp with time zone;