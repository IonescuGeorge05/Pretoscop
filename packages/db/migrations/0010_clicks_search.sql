CREATE TABLE "clicks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clicks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offer_id" bigint NOT NULL,
	"product_id" bigint,
	"shop_id" bigint NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"is_affiliate" boolean DEFAULT false NOT NULL,
	"placement" text,
	"referer_type" text,
	"ua_hash" text,
	"ip_hash" text,
	"session_hash" text
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "search_url_template" text;--> statement-breakpoint
CREATE INDEX "clicks_ts_brin" ON "clicks" USING brin ("ts");--> statement-breakpoint
CREATE INDEX "clicks_offer_idx" ON "clicks" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "clicks_shop_ts_idx" ON "clicks" USING btree ("shop_id","ts");