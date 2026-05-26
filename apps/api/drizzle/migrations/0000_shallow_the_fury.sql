CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_name" text NOT NULL,
	"action_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"tenant_id" text NOT NULL,
	"source_system" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_id" text,
	"route" text,
	"http_method" text,
	"http_status" integer,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_name" text NOT NULL,
	"customer_name" text NOT NULL,
	"current_sku" text NOT NULL,
	"seat_count" integer NOT NULL,
	"cost_per_user" double precision NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"reseller_name" text NOT NULL,
	"distributor_name" text NOT NULL,
	"pss_ai_workforce_name" text DEFAULT '' NOT NULL,
	"pss_ai_security_name" text DEFAULT '' NOT NULL,
	"psa_name" text DEFAULT '' NOT NULL,
	"pdm_name" text NOT NULL,
	"pmm_name" text NOT NULL,
	"current_product" text NOT NULL,
	"sku_category" text NOT NULL,
	"seat_count" integer NOT NULL,
	"annual_revenue_run_rate" double precision NOT NULL,
	"renewal_date" date NOT NULL,
	"term_months" integer NOT NULL,
	"auto_renew" boolean NOT NULL,
	"multi_year" boolean NOT NULL,
	"has_copilot" boolean NOT NULL,
	"has_purview" boolean NOT NULL,
	"has_sure_step" boolean NOT NULL,
	"current_margin" double precision NOT NULL,
	"customer_segment" text NOT NULL,
	"region" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"entra_object_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"given_name" text,
	"surname" text,
	"job_title" text,
	"department" text,
	"office_location" text,
	"company_name" text,
	"city" text,
	"country" text,
	"mobile_phone" text,
	"business_phones" jsonb,
	"preferred_language" text,
	"employee_id" text,
	"employee_type" text,
	"user_principal_name" text,
	"photo_url" text,
	"roles" text[] DEFAULT ARRAY['MEMBER']::TEXT[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "partner_customers" ADD CONSTRAINT "partner_customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_event_name_idx" ON "audit_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_id_idx" ON "audit_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "partner_customers_created_by_user_id_idx" ON "partner_customers" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_customers_customer_name_idx" ON "partner_customers" USING btree ("customer_name");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_subscription_uidx" ON "subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_reseller_idx" ON "subscriptions" USING btree ("reseller_name");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_renewal_idx" ON "subscriptions" USING btree ("renewal_date");--> statement-breakpoint
CREATE INDEX "subscriptions_arr_idx" ON "subscriptions" USING btree ("annual_revenue_run_rate");--> statement-breakpoint
CREATE INDEX "subscriptions_region_idx" ON "subscriptions" USING btree ("region");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_name_idx" ON "subscriptions" USING btree ("customer_name");--> statement-breakpoint
CREATE INDEX "subscriptions_distributor_idx" ON "subscriptions" USING btree ("distributor_name");--> statement-breakpoint
CREATE INDEX "subscriptions_pss_ai_workforce_idx" ON "subscriptions" USING btree ("pss_ai_workforce_name");--> statement-breakpoint
CREATE INDEX "subscriptions_pss_ai_security_idx" ON "subscriptions" USING btree ("pss_ai_security_name");--> statement-breakpoint
CREATE INDEX "subscriptions_psa_idx" ON "subscriptions" USING btree ("psa_name");--> statement-breakpoint
CREATE INDEX "subscriptions_pdm_idx" ON "subscriptions" USING btree ("pdm_name");--> statement-breakpoint
CREATE INDEX "subscriptions_pmm_idx" ON "subscriptions" USING btree ("pmm_name");--> statement-breakpoint
CREATE INDEX "subscriptions_seat_count_idx" ON "subscriptions" USING btree ("seat_count");--> statement-breakpoint
CREATE UNIQUE INDEX "users_entra_object_id_uidx" ON "users" USING btree ("entra_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active");