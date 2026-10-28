CREATE TABLE "merchants" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "merchants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"shop_id" bigint,
	"status" text DEFAULT 'draft' NOT NULL,
	"shop_name" text,
	"company_name" text,
	"cui" text,
	"contact_name" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"website_url" text,
	"domain" text,
	"verification_token" text NOT NULL,
	"verification_method" text,
	"domain_verified_at" timestamp with time zone,
	"domain_check" jsonb,
	"feed_url" text,
	"feed_upload_key" text,
	"feed_uploaded_at" timestamp with time zone,
	"feed_format" text,
	"price_format" text,
	"shipping_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation" jsonb,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"plan" text DEFAULT 'free' NOT NULL,
	"status_reason" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_status_ck" CHECK ("merchants"."status" in ('draft','pending','approved','rejected','suspended')),
	CONSTRAINT "merchants_feed_format_ck" CHECK ("merchants"."feed_format" is null or "merchants"."feed_format" in ('google','compari','csv')),
	CONSTRAINT "merchants_price_format_ck" CHECK ("merchants"."price_format" is null or "merchants"."price_format" in ('decimal','ro')),
	CONSTRAINT "merchants_verification_method_ck" CHECK ("merchants"."verification_method" is null or "merchants"."verification_method" in ('email','dns','file','admin'))
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_user_uq" ON "merchants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merchants_status_idx" ON "merchants" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_domain_approved_uq" ON "merchants" USING btree ("domain") WHERE "merchants"."status" = 'approved';