ALTER TABLE "external_subscription" ADD COLUMN "dominant_sku_group" text;--> statement-breakpoint
ALTER TABLE "external_subscription" ADD COLUMN "dashboard_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "external_subscription_org_dashboard_visible_idx" ON "external_subscription" USING btree ("org_id","dashboard_visible");