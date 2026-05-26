CREATE TABLE "analytics_download_issuances" (
	"token_jti" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"token_scope" text NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text,
	"request_id" text,
	"route" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_download_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"token_jti" text NOT NULL,
	"category" text NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text,
	"request_id" text,
	"route" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"download_count" integer DEFAULT 1 NOT NULL,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"us_entity_count" integer DEFAULT 0 NOT NULL,
	"canada_entity_count" integer DEFAULT 0 NOT NULL,
	"latam_entity_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_download_facts_token_jti_analytics_download_issuances_token_jti_fk"
		FOREIGN KEY ("token_jti") REFERENCES "public"."analytics_download_issuances"("token_jti") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "analytics_download_issuances_tenant_category_issued_idx" ON "analytics_download_issuances" USING btree ("tenant_id","category","issued_at");
--> statement-breakpoint
CREATE INDEX "analytics_download_issuances_tenant_actor_issued_idx" ON "analytics_download_issuances" USING btree ("tenant_id","actor_id","issued_at");
--> statement-breakpoint
CREATE INDEX "analytics_download_facts_tenant_category_occurred_idx" ON "analytics_download_facts" USING btree ("tenant_id","category","occurred_at");
--> statement-breakpoint
CREATE INDEX "analytics_download_facts_tenant_actor_occurred_idx" ON "analytics_download_facts" USING btree ("tenant_id","actor_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "analytics_download_facts_token_jti_idx" ON "analytics_download_facts" USING btree ("token_jti");
