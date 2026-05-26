CREATE TABLE "proposal_generation_selections" (
	"id" text PRIMARY KEY NOT NULL,
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
	"selected_seats" integer NOT NULL,
	"target_sku_price" double precision,
	"target_sku_margin_percent" double precision,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_generation_selections_generation_request_scenario_uidx" ON "proposal_generation_selections" USING btree ("generation_request_id","opportunity_id","ending_sku_id");--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_generation_request_idx" ON "proposal_generation_selections" USING btree ("generation_request_id");--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_tenant_occurred_idx" ON "proposal_generation_selections" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_tenant_ending_sku_occurred_idx" ON "proposal_generation_selections" USING btree ("tenant_id","ending_sku_id","occurred_at");--> statement-breakpoint
CREATE INDEX "proposal_generation_selections_tenant_actor_occurred_idx" ON "proposal_generation_selections" USING btree ("tenant_id","actor_id","occurred_at");