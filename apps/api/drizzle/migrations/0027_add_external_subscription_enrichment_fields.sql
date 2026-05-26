ALTER TABLE "external_subscription" ADD COLUMN "copilot_seats_whitespace" integer;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "all_agent_mau" integer;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "mci_eligibility" integer;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "mci_engagement_name" text;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "adoption_status" text;