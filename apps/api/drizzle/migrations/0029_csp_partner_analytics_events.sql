CREATE TYPE "public"."csp_partner_event_type" AS ENUM('login', 'view_proposal', 'proposal_generated', 'subscription_upload');--> statement-breakpoint
CREATE TYPE "public"."csp_partner_starting_sku" AS ENUM('bb', 'bs', 'bp', 'other');--> statement-breakpoint
CREATE TYPE "public"."csp_partner_ending_sku" AS ENUM('bs_cb', 'bp_cb', 'bp_cb_purview', 'bp_defender', 'bp_purview', 'bp_defender_purview');--> statement-breakpoint
CREATE TYPE "public"."csp_partner_country" AS ENUM('United States', 'Canada', 'Mexico', 'Brazil', 'Central and Caribbean Region', 'Spanish South America Region', 'Antigua and Barbuda', 'Argentina', 'Bahamas', 'Barbados', 'Bolivia', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Dominica', 'Dominican Republic', 'El Salvador', 'Ecuador', 'Grenada', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Nicaragua', 'Panama', 'Paraguay', 'Peru', 'St. Kitts and Nevis', 'St. Lucia', 'St. Vincent and The Grenadines', 'Trinidad and Tobago', 'Uruguay', 'Venezuela', 'New Zealand', 'Australia', 'Norway', 'United Kingdom', 'Denmark', 'Sweden', 'Ireland', 'India', 'Malaysia', 'Singapore', 'Germany', 'Netherlands');--> statement-breakpoint
CREATE TABLE "csp_partner_analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"event_type" "csp_partner_event_type" NOT NULL,
	"country" "csp_partner_country",
	"starting_sku_id" "csp_partner_starting_sku",
	"ending_sku_id" "csp_partner_ending_sku",
	"upload_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "csp_partner_analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "csp_partner_analytics_events" ADD CONSTRAINT "csp_pae_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csp_partner_analytics_events" ADD CONSTRAINT "csp_pae_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."reseller_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "csp_pae_org_created_idx" ON "csp_partner_analytics_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "csp_pae_event_created_idx" ON "csp_partner_analytics_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "csp_pae_country_created_idx" ON "csp_partner_analytics_events" USING btree ("country","created_at");--> statement-breakpoint
CREATE INDEX "csp_pae_org_event_created_idx" ON "csp_partner_analytics_events" USING btree ("org_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "csp_pae_starting_sku_created_idx" ON "csp_partner_analytics_events" USING btree ("starting_sku_id","created_at");--> statement-breakpoint
CREATE INDEX "csp_pae_ending_sku_created_idx" ON "csp_partner_analytics_events" USING btree ("ending_sku_id","created_at");
