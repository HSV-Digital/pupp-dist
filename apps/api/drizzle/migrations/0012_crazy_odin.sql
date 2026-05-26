CREATE TABLE "reseller_audit_events" (
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
CREATE TABLE "reseller_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"primary_domain" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"renewal_date" date NOT NULL,
	"seats" integer NOT NULL,
	"current_arr" double precision NOT NULL,
	"current_sku" text NOT NULL,
	"region" text NOT NULL,
	"cost_per_user" double precision NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_user_identity_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"reseller_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text NOT NULL,
	"issuer" text,
	"tenant_id" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reseller_subscription" ADD CONSTRAINT "reseller_subscription_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_subscription" ADD CONSTRAINT "reseller_subscription_created_by_reseller_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."reseller_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_user_identity_aliases" ADD CONSTRAINT "reseller_user_identity_aliases_reseller_user_id_reseller_users_id_fk" FOREIGN KEY ("reseller_user_id") REFERENCES "public"."reseller_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_users" ADD CONSTRAINT "reseller_users_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reseller_audit_events_occurred_idx" ON "reseller_audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_event_name_idx" ON "reseller_audit_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_actor_id_idx" ON "reseller_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_request_id_idx" ON "reseller_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_target_id_idx" ON "reseller_audit_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_tenant_event_occurred_idx" ON "reseller_audit_events" USING btree ("tenant_id","event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_tenant_actor_occurred_idx" ON "reseller_audit_events" USING btree ("tenant_id","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_audit_events_tenant_occurred_idx" ON "reseller_audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_organization_normalized_domain_uidx" ON "reseller_organization" USING btree ("normalized_domain");--> statement-breakpoint
CREATE INDEX "reseller_organization_active_idx" ON "reseller_organization" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "reseller_subscription_org_idx" ON "reseller_subscription" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reseller_subscription_org_customer_name_idx" ON "reseller_subscription" USING btree ("org_id","customer_name");--> statement-breakpoint
CREATE INDEX "reseller_subscription_org_renewal_date_idx" ON "reseller_subscription" USING btree ("org_id","renewal_date");--> statement-breakpoint
CREATE INDEX "reseller_subscription_org_current_sku_idx" ON "reseller_subscription" USING btree ("org_id","current_sku");--> statement-breakpoint
CREATE INDEX "reseller_subscription_org_region_idx" ON "reseller_subscription" USING btree ("org_id","region");--> statement-breakpoint
CREATE INDEX "reseller_subscription_created_by_idx" ON "reseller_subscription" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_user_identity_aliases_provider_subject_uidx" ON "reseller_user_identity_aliases" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "reseller_user_identity_aliases_user_idx" ON "reseller_user_identity_aliases" USING btree ("reseller_user_id");--> statement-breakpoint
CREATE INDEX "reseller_user_identity_aliases_email_idx" ON "reseller_user_identity_aliases" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reseller_user_identity_aliases_tenant_idx" ON "reseller_user_identity_aliases" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_users_org_email_uidx" ON "reseller_users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "reseller_users_org_idx" ON "reseller_users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reseller_users_email_idx" ON "reseller_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reseller_users_active_idx" ON "reseller_users" USING btree ("is_active");