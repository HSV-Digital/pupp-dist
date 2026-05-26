ALTER TABLE "subscriptions" ADD COLUMN "type" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
CREATE INDEX "subscriptions_type_idx" ON "subscriptions" USING btree ("type");