CREATE TABLE "user_identity_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"identity_type" text NOT NULL,
	"identity_value" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_identity_aliases" ADD CONSTRAINT "user_identity_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_identity_aliases_provider_type_value_uidx" ON "user_identity_aliases" USING btree ("provider","identity_type","identity_value");--> statement-breakpoint
CREATE INDEX "user_identity_aliases_user_idx" ON "user_identity_aliases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_identity_aliases_tenant_type_idx" ON "user_identity_aliases" USING btree ("tenant_id","identity_type");