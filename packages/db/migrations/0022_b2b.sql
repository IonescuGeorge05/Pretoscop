CREATE TABLE "b2b_api_keys" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "b2b_api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"public_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE "b2b_api_usage" (
	"workspace_id" bigint NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"refused" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "b2b_api_usage_workspace_id_day_pk" PRIMARY KEY("workspace_id","day")
);
--> statement-breakpoint
CREATE TABLE "b2b_billing_events" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_billing_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "b2b_digests" (
	"workspace_id" bigint NOT NULL,
	"day" date NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "b2b_digests_workspace_id_day_user_id_pk" PRIMARY KEY("workspace_id","day","user_id"),
	CONSTRAINT "b2b_digests_status_ck" CHECK ("b2b_digests"."status" in ('sending','sent','empty','failed'))
);
--> statement-breakpoint
CREATE TABLE "b2b_invites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "b2b_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "b2b_invites_role_ck" CHECK ("b2b_invites"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "b2b_invoices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "b2b_invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"plan" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"currency" text NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"buyer_name" text,
	"buyer_cui" text,
	"buyer_reg_com" text,
	"buyer_address" text,
	"buyer_email" text,
	"status" text DEFAULT 'paid' NOT NULL,
	"paid_at" timestamp with time zone,
	"fiscal_number" text,
	"efactura_status" text DEFAULT 'to_issue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_invoices_status_ck" CHECK ("b2b_invoices"."status" in ('paid','refunded','void')),
	CONSTRAINT "b2b_invoices_efactura_ck" CHECK ("b2b_invoices"."efactura_status" in ('to_issue','issued','sent','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "b2b_members" (
	"workspace_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"digest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "b2b_members_role_ck" CHECK ("b2b_members"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "b2b_skus" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "b2b_skus_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"identity" text NOT NULL,
	"product_id" bigint,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"match_method" text,
	"ref" text,
	"label" text,
	"gtin14" text,
	"mpn_raw" text,
	"mpn_norm" text,
	"brand_raw" text,
	"reference_price" numeric(12, 2),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_skus_status_ck" CHECK ("b2b_skus"."status" in ('matched','unmatched','ambiguous')),
	CONSTRAINT "b2b_skus_matched_ck" CHECK (("b2b_skus"."status" = 'matched') = ("b2b_skus"."product_id" is not null)),
	CONSTRAINT "b2b_skus_method_ck" CHECK ("b2b_skus"."match_method" is null or "b2b_skus"."match_method" in ('gtin','brand_mpn','mpn','catalogue'))
);
--> statement-breakpoint
CREATE TABLE "b2b_workspaces" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "b2b_workspaces_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"shop_id" bigint,
	"brand_id" bigint,
	"merchant_id" bigint,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sku_limit" integer,
	"api_daily_quota" integer,
	"company_name" text,
	"cui" text,
	"reg_com" text,
	"billing_address" text,
	"billing_email" text,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"terms_accepted_by" text,
	"billing_provider" text,
	"billing_customer_id" text,
	"billing_subscription_id" text,
	"billing_status" text DEFAULT 'none' NOT NULL,
	"billing_period_end" timestamp with time zone,
	"status_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_workspaces_kind_ck" CHECK ("b2b_workspaces"."kind" in ('merchant','brand')),
	CONSTRAINT "b2b_workspaces_plan_ck" CHECK ("b2b_workspaces"."plan" in ('pilot','starter','pro','enterprise')),
	CONSTRAINT "b2b_workspaces_status_ck" CHECK ("b2b_workspaces"."status" in ('active','suspended','cancelled')),
	CONSTRAINT "b2b_workspaces_limits_ck" CHECK (("b2b_workspaces"."sku_limit" is null or "b2b_workspaces"."sku_limit" >= 0) and ("b2b_workspaces"."api_daily_quota" is null or "b2b_workspaces"."api_daily_quota" >= 0)),
	CONSTRAINT "b2b_workspaces_billing_status_ck" CHECK ("b2b_workspaces"."billing_status" in ('none','checkout','active','past_due','canceled','unpaid','incomplete'))
);
--> statement-breakpoint
ALTER TABLE "b2b_api_keys" ADD CONSTRAINT "b2b_api_keys_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_api_usage" ADD CONSTRAINT "b2b_api_usage_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_digests" ADD CONSTRAINT "b2b_digests_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_digests" ADD CONSTRAINT "b2b_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_invites" ADD CONSTRAINT "b2b_invites_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_invoices" ADD CONSTRAINT "b2b_invoices_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_members" ADD CONSTRAINT "b2b_members_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_members" ADD CONSTRAINT "b2b_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_skus" ADD CONSTRAINT "b2b_skus_workspace_id_b2b_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."b2b_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_skus" ADD CONSTRAINT "b2b_skus_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_workspaces" ADD CONSTRAINT "b2b_workspaces_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_workspaces" ADD CONSTRAINT "b2b_workspaces_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b2b_workspaces" ADD CONSTRAINT "b2b_workspaces_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_api_keys_public_uq" ON "b2b_api_keys" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "b2b_api_keys_workspace_idx" ON "b2b_api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_invites_open_uq" ON "b2b_invites" USING btree ("workspace_id","email") WHERE "b2b_invites"."accepted_at" is null;--> statement-breakpoint
CREATE INDEX "b2b_invites_email_idx" ON "b2b_invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_invoices_provider_uq" ON "b2b_invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "b2b_invoices_workspace_idx" ON "b2b_invoices" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "b2b_members_user_idx" ON "b2b_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_skus_identity_uq" ON "b2b_skus" USING btree ("workspace_id","identity");--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_skus_product_uq" ON "b2b_skus" USING btree ("workspace_id","product_id") WHERE "b2b_skus"."product_id" is not null;--> statement-breakpoint
CREATE INDEX "b2b_skus_status_idx" ON "b2b_skus" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "b2b_skus_product_idx" ON "b2b_skus" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "b2b_workspaces_shop_idx" ON "b2b_workspaces" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "b2b_workspaces_subscription_uq" ON "b2b_workspaces" USING btree ("billing_provider","billing_subscription_id");--> statement-breakpoint
CREATE VIEW "public"."b2b_products" AS (
  SELECT p.id, p.slug, p.title, p.title_ascii, p.status, p.merged_into_id, p.mpn, p.mpn_norm, p.brand_id, b.name AS brand, c.name_ro AS category
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id);