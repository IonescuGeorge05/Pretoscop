CREATE TABLE "outreach" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outreach_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"shop_id" bigint NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"contact" text,
	"template" text,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"answer" text,
	"next_step_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_purpose_ck" CHECK ("outreach"."purpose" in ('feed','allowlist','feed_or_allowlist','partnership','other')),
	CONSTRAINT "outreach_channel_ck" CHECK ("outreach"."channel" in ('email','form','phone','meeting','other')),
	CONSTRAINT "outreach_status_ck" CHECK ("outreach"."status" in ('planned','sent','replied','agreed','declined','no_answer'))
);
--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_shop_idx" ON "outreach" USING btree ("shop_id","created_at");