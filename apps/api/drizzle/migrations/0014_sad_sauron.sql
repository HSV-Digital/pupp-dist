CREATE TABLE "reseller_proposal_generation_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"generation_request_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text,
	"customer_id" text NOT NULL,
	"journey" text NOT NULL,
	"customer_source" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"starting_sku_id" text NOT NULL,
	"ending_sku_id" text NOT NULL,
	"region" text,
	"distributor_name" text,
	"reseller_name" text,
	"pss_ai_workforce_name" text,
	"pss_ai_security_name" text,
	"pdm_name" text,
	"pmm_name" text,
	"subscription_type" text,
	"expiring_seat_count" integer,
	"selected_seats" integer NOT NULL,
	"target_sku_price" double precision,
	"target_sku_margin_percent" double precision,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ADD CONSTRAINT "reseller_proposal_generation_selections_org_id_reseller_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."reseller_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_pgs_generation_request_scenario_uidx" ON "reseller_proposal_generation_selections" USING btree ("generation_request_id","opportunity_id","ending_sku_id");--> statement-breakpoint
CREATE INDEX "reseller_pgs_generation_request_idx" ON "reseller_proposal_generation_selections" USING btree ("generation_request_id");--> statement-breakpoint
CREATE INDEX "reseller_pgs_org_occurred_idx" ON "reseller_proposal_generation_selections" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_pgs_org_ending_sku_occurred_idx" ON "reseller_proposal_generation_selections" USING btree ("org_id","ending_sku_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_pgs_org_actor_occurred_idx" ON "reseller_proposal_generation_selections" USING btree ("org_id","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reseller_pgs_tenant_occurred_idx" ON "reseller_proposal_generation_selections" USING btree ("tenant_id","occurred_at");