CREATE TABLE "merchant_wallets" (
	"merchant_id" bigint PRIMARY KEY NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_wallets_balance_ck" CHECK ("merchant_wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "placement_floors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "placement_floors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"category_id" bigint,
	"price_band" text NOT NULL,
	"floor" numeric(12, 2) NOT NULL,
	"cap" numeric(12, 2) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_floors_band_ck" CHECK ("placement_floors"."price_band" in ('0-200','200-1000','1000-3000','3000+')),
	CONSTRAINT "placement_floors_amount_ck" CHECK ("placement_floors"."floor" > 0 and "placement_floors"."cap" >= "placement_floors"."floor")
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "placements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"merchant_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	"price_band" text,
	"bid" numeric(12, 2) NOT NULL,
	"daily_cap" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"admin_hold" boolean DEFAULT false NOT NULL,
	"admin_hold_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_status_ck" CHECK ("placements"."status" in ('active','paused','archived')),
	CONSTRAINT "placements_band_ck" CHECK ("placements"."price_band" is null or "placements"."price_band" in ('0-200','200-1000','1000-3000','3000+')),
	CONSTRAINT "placements_bid_ck" CHECK ("placements"."bid" > 0 and "placements"."daily_cap" >= "placements"."bid")
);
--> statement-breakpoint
CREATE TABLE "promoted_clicks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promoted_clicks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"click_id" bigint,
	"placement_id" bigint NOT NULL,
	"merchant_id" bigint NOT NULL,
	"offer_id" bigint NOT NULL,
	"product_id" bigint,
	"category_id" bigint,
	"slot" text NOT NULL,
	"day" date NOT NULL,
	"session_hash" text,
	"ip_hash" text,
	"status" text NOT NULL,
	"reason" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promoted_clicks_slot_ck" CHECK ("promoted_clicks"."slot" in ('product','category')),
	CONSTRAINT "promoted_clicks_status_ck" CHECK (("promoted_clicks"."status" = 'billed' and "promoted_clicks"."price" > 0 and "promoted_clicks"."reason" is null) or ("promoted_clicks"."status" = 'refunded' and "promoted_clicks"."price" > 0) or ("promoted_clicks"."status" = 'not_billed' and "promoted_clicks"."price" = 0 and "promoted_clicks"."reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"merchant_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"ref" text NOT NULL,
	"promoted_click_id" bigint,
	"topup_id" bigint,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_kind_ck" CHECK ("wallet_ledger"."kind" in ('topup','click','click_refund','adjustment')),
	CONSTRAINT "wallet_ledger_sign_ck" CHECK ("wallet_ledger"."amount" <> 0 and "wallet_ledger"."balance_after" >= 0 and ("wallet_ledger"."kind" = 'adjustment' or ("wallet_ledger"."kind" in ('topup','click_refund') and "wallet_ledger"."amount" > 0) or ("wallet_ledger"."kind" = 'click' and "wallet_ledger"."amount" < 0)))
);
--> statement-breakpoint
CREATE TABLE "wallet_topups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_topups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"merchant_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"net" numeric(12, 2) NOT NULL,
	"vat" numeric(12, 2) NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"vat_percent" smallint NOT NULL,
	"currency" text DEFAULT 'RON' NOT NULL,
	"billing_name" text,
	"billing_cui" text,
	"event_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_topups_status_ck" CHECK ("wallet_topups"."status" in ('created','pending','paid','expired','failed')),
	CONSTRAINT "wallet_topups_amount_ck" CHECK ("wallet_topups"."net" > 0 and "wallet_topups"."vat" >= 0 and "wallet_topups"."gross" = "wallet_topups"."net" + "wallet_topups"."vat")
);
--> statement-breakpoint
ALTER TABLE "placement_floors" ADD CONSTRAINT "placement_floors_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "placement_floors_uq" ON "placement_floors" USING btree (coalesce("category_id", 0),"price_band");--> statement-breakpoint
CREATE INDEX "placements_category_idx" ON "placements" USING btree ("category_id") WHERE "placements"."status" = 'active' AND NOT "placements"."admin_hold";--> statement-breakpoint
CREATE INDEX "placements_merchant_idx" ON "placements" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "placements_live_uq" ON "placements" USING btree ("merchant_id","category_id",coalesce("price_band", '*')) WHERE "placements"."status" <> 'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "promoted_clicks_once_uq" ON "promoted_clicks" USING btree ("offer_id","session_hash","day") WHERE "promoted_clicks"."status" <> 'not_billed';--> statement-breakpoint
CREATE INDEX "promoted_clicks_placement_idx" ON "promoted_clicks" USING btree ("placement_id","created_at");--> statement-breakpoint
CREATE INDEX "promoted_clicks_merchant_idx" ON "promoted_clicks" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "promoted_clicks_session_idx" ON "promoted_clicks" USING btree ("session_hash","created_at");--> statement-breakpoint
CREATE INDEX "promoted_clicks_ip_idx" ON "promoted_clicks" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_ref_uq" ON "wallet_ledger" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "wallet_ledger_merchant_idx" ON "wallet_ledger" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_topups_external_uq" ON "wallet_topups" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "wallet_topups_merchant_idx" ON "wallet_topups" USING btree ("merchant_id","created_at");