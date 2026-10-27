CREATE TABLE "fx_rates" (
	"day" date NOT NULL,
	"currency" char(3) NOT NULL,
	"rate" numeric(10, 4) NOT NULL,
	"source" text DEFAULT 'bnr' NOT NULL,
	CONSTRAINT "fx_rates_day_currency_pk" PRIMARY KEY("day","currency")
);
--> statement-breakpoint
CREATE TABLE "price_events_quarantine" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_events_quarantine_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offer_id" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"median_price" numeric(12, 2),
	"ratio" real,
	"reason" text NOT NULL,
	"observation" text NOT NULL,
	"run_id" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_events_quarantine_status_ck" CHECK ("price_events_quarantine"."status" in ('pending','confirmed','rejected','released'))
);
--> statement-breakpoint
ALTER TABLE "price_events_quarantine" ADD CONSTRAINT "price_events_quarantine_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_events_quarantine_offer_idx" ON "price_events_quarantine" USING btree ("offer_id","status");