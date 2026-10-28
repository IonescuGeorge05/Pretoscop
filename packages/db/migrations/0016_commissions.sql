CREATE TABLE "commissions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"network" text NOT NULL,
	"network_commission_id" text NOT NULL,
	"shop_id" bigint,
	"program_external_id" text,
	"click_id" bigint,
	"status" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"sale_amount" numeric(12, 2),
	"currency" text DEFAULT 'RON' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"network_updated_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	CONSTRAINT "commissions_status_ck" CHECK ("commissions"."status" in ('pending','accepted','rejected','paid'))
);
--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commissions_network_id_uq" ON "commissions" USING btree ("network","network_commission_id");--> statement-breakpoint
CREATE INDEX "commissions_shop_occurred_idx" ON "commissions" USING btree ("shop_id","occurred_at");--> statement-breakpoint
CREATE INDEX "commissions_click_idx" ON "commissions" USING btree ("click_id");