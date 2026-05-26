CREATE TABLE "reseller_otps" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reseller_otps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "reseller_otps_email_idx" ON "reseller_otps" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reseller_otps_expires_at_idx" ON "reseller_otps" USING btree ("expires_at");