ALTER TABLE "reseller_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_user_identity_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_audit_events" ADD COLUMN "org_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reseller_user_identity_aliases" ADD COLUMN "org_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reseller_audit_events" ADD CONSTRAINT "reseller_audit_events_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_user_identity_aliases" ADD CONSTRAINT "reseller_user_identity_aliases_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reseller_audit_events_org_idx" ON "reseller_audit_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reseller_user_identity_aliases_org_idx" ON "reseller_user_identity_aliases" USING btree ("org_id");