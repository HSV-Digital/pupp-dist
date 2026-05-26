-- Migrate data from reseller_subscription to external_subscription before dropping
CREATE TABLE "external_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"source" text NOT NULL,
	"distributor_name" text,
	"distributor_id" text,
	"partner_name" text,
	"partner_global_id" text,
	"partner_one_id" text,
	"customer_tpid" text,
	"account_name" text,
	"country_name" text,
	"copilot_fit" text,
	"copilot_intent" text,
	"copilot_cluster" text,
	"mw_csp_annual_renewal" text,
	"mw_paid_seat_range" text,
	"has_transacted_product" text,
	"has_compete" text,
	"tenant_ids" text,
	"subscription_name" text,
	"licenses_count" integer,
	"subscription_end_date" date,
	"type" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD CONSTRAINT "external_subscription_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD CONSTRAINT "external_subscription_created_by_reseller_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."reseller_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_subscription_org_idx" ON "external_subscription" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "external_subscription_org_source_idx" ON "external_subscription" USING btree ("org_id","source");--> statement-breakpoint
CREATE INDEX "external_subscription_org_account_name_idx" ON "external_subscription" USING btree ("org_id","account_name");--> statement-breakpoint
CREATE INDEX "external_subscription_customer_tpid_idx" ON "external_subscription" USING btree ("customer_tpid");--> statement-breakpoint
CREATE INDEX "external_subscription_partner_global_id_idx" ON "external_subscription" USING btree ("partner_global_id");--> statement-breakpoint
CREATE INDEX "external_subscription_created_by_idx" ON "external_subscription" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "external_subscription_org_subscription_end_date_idx" ON "external_subscription" USING btree ("org_id","subscription_end_date");--> statement-breakpoint

-- Migrate existing reseller_subscription data
INSERT INTO "external_subscription" ("id", "org_id", "source", "account_name", "country_name", "subscription_name", "licenses_count", "subscription_end_date", "created_by", "created_at", "updated_at")
SELECT "id", "org_id", 'form', "customer_name", "region", "current_sku", "seats", "renewal_date", "created_by", "created_at", "updated_at"
FROM "reseller_subscription";
--> statement-breakpoint

-- Drop old table
DROP TABLE "reseller_subscription";
--> statement-breakpoint

-- Upload Jobs table
CREATE TABLE "upload_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detected_source" text,
	"original_filename" text,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"accepted_rows" integer DEFAULT 0 NOT NULL,
	"rejected_rows" integer DEFAULT 0 NOT NULL,
	"flagged_rows_data" text,
	"error_message" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "upload_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD CONSTRAINT "upload_jobs_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD CONSTRAINT "upload_jobs_created_by_reseller_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."reseller_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_jobs_org_idx" ON "upload_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "upload_jobs_status_idx" ON "upload_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upload_jobs_created_by_idx" ON "upload_jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "upload_jobs_created_at_idx" ON "upload_jobs" USING btree ("created_at");--> statement-breakpoint

-- Master tables
CREATE TABLE "master_distributor" (
	"id" text PRIMARY KEY NOT NULL,
	"distributor_id" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "master_distributor_distributor_id_idx" ON "master_distributor" USING btree ("distributor_id");--> statement-breakpoint
CREATE INDEX "master_distributor_name_idx" ON "master_distributor" USING btree ("name");--> statement-breakpoint

CREATE TABLE "master_partner" (
	"id" text PRIMARY KEY NOT NULL,
	"global_id" text,
	"name" text,
	"one_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "master_partner_global_id_idx" ON "master_partner" USING btree ("global_id");--> statement-breakpoint
CREATE INDEX "master_partner_name_idx" ON "master_partner" USING btree ("name");--> statement-breakpoint
CREATE INDEX "master_partner_one_id_idx" ON "master_partner" USING btree ("one_id");--> statement-breakpoint

CREATE TABLE "master_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_tpid" text,
	"customer_name" text,
	"country_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "master_customer_tpid_idx" ON "master_customer" USING btree ("customer_tpid");--> statement-breakpoint
CREATE INDEX "master_customer_name_idx" ON "master_customer" USING btree ("customer_name");--> statement-breakpoint

-- Flagged Rows table
CREATE TABLE "flagged_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_job_id" text NOT NULL,
	"org_id" text NOT NULL,
	"reason" text NOT NULL,
	"reason_detail" text,
	"raw_row" text NOT NULL,
	"candidate_ids" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flagged_rows" ADD CONSTRAINT "flagged_rows_upload_job_id_upload_jobs_id_fk" FOREIGN KEY ("upload_job_id") REFERENCES "public"."upload_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flagged_rows" ADD CONSTRAINT "flagged_rows_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flagged_rows_upload_job_idx" ON "flagged_rows" USING btree ("upload_job_id");--> statement-breakpoint
CREATE INDEX "flagged_rows_org_status_idx" ON "flagged_rows" USING btree ("org_id","status");
