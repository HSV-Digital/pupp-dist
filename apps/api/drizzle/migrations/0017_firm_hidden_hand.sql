~CREATE TABLE "download_token_redemptions" (
	"token_jti" text PRIMARY KEY NOT NULL,
	"token_scope" text NOT NULL,
	"request_id" text,
	"route" text,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "download_token_redemptions_scope_consumed_idx" ON "download_token_redemptions" USING btree ("token_scope","consumed_at");
