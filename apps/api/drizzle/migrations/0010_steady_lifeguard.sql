ALTER TABLE "proposal_generation_selections"
	ADD COLUMN "region" text,
	ADD COLUMN "distributor_name" text,
	ADD COLUMN "reseller_name" text,
	ADD COLUMN "pss_ai_workforce_name" text,
	ADD COLUMN "pss_ai_security_name" text,
	ADD COLUMN "pdm_name" text,
	ADD COLUMN "pmm_name" text,
	ADD COLUMN "subscription_type" text,
	ADD COLUMN "expiring_seat_count" integer;
--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_tenant_distributor_occurred_idx" ON "proposal_generation_selections" USING btree ("tenant_id","distributor_name","occurred_at");
--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_tenant_reseller_occurred_idx" ON "proposal_generation_selections" USING btree ("tenant_id","reseller_name","occurred_at");
