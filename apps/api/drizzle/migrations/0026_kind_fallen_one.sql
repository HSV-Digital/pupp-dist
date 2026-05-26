CREATE TABLE "reseller_subscription_enrichment_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_filename" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"matched_rows" integer DEFAULT 0 NOT NULL,
	"unmatched_rows" integer DEFAULT 0 NOT NULL,
	"updated_subscriptions" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_by_reseller_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reseller_subscription_enrichment_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "copilot_eligible_m365_seats" integer;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "free_copilot_chat_mau" integer;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "copilot_mau_percentage" double precision;--> statement-breakpoint
ALTER TABLE "reseller_subscription_enrichment_jobs" ADD CONSTRAINT "reseller_subscription_enrichment_jobs_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_subscription_enrichment_jobs" ADD CONSTRAINT "reseller_subscription_enrichment_jobs_created_by_reseller_user_id_reseller_users_id_fk" FOREIGN KEY ("created_by_reseller_user_id") REFERENCES "public"."reseller_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reseller_subscription_enrichment_jobs_org_idx" ON "reseller_subscription_enrichment_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reseller_subscription_enrichment_jobs_status_idx" ON "reseller_subscription_enrichment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reseller_subscription_enrichment_jobs_created_by_idx" ON "reseller_subscription_enrichment_jobs" USING btree ("created_by_reseller_user_id");--> statement-breakpoint
CREATE INDEX "reseller_subscription_enrichment_jobs_created_at_idx" ON "reseller_subscription_enrichment_jobs" USING btree ("created_at");