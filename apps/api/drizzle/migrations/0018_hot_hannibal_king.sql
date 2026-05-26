ALTER TABLE "proposal_generation_selections" ADD COLUMN "current_sku_customer_price" double precision;--> statement-breakpoint
ALTER TABLE "proposal_generation_selections" ADD COLUMN "current_sku_reseller_price" double precision;--> statement-breakpoint
ALTER TABLE "proposal_generation_selections" ADD COLUMN "target_sku_customer_price" double precision;--> statement-breakpoint
ALTER TABLE "proposal_generation_selections" ADD COLUMN "target_sku_reseller_price" double precision;--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ADD COLUMN "current_sku_customer_price" double precision;--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ADD COLUMN "current_sku_reseller_price" double precision;--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ADD COLUMN "target_sku_customer_price" double precision;--> statement-breakpoint
ALTER TABLE "reseller_proposal_generation_selections" ADD COLUMN "target_sku_reseller_price" double precision;
