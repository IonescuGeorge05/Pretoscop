CREATE TABLE "crawl_urls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crawl_urls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"shop_id" bigint NOT NULL,
	"source_id" bigint,
	"url" text NOT NULL,
	"kind" text DEFAULT 'product' NOT NULL,
	"external_hint" text,
	"priority" real DEFAULT 0 NOT NULL,
	"tier" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_status" smallint,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"gone_at" timestamp with time zone,
	CONSTRAINT "crawl_urls_kind_ck" CHECK ("crawl_urls"."kind" in ('product','listing'))
);
--> statement-breakpoint
ALTER TABLE "crawl_urls" ADD CONSTRAINT "crawl_urls_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_urls" ADD CONSTRAINT "crawl_urls_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_urls_shop_url_uq" ON "crawl_urls" USING btree ("shop_id","url");--> statement-breakpoint
CREATE INDEX "crawl_urls_shop_fetched_idx" ON "crawl_urls" USING btree ("shop_id","last_fetched_at");--> statement-breakpoint
CREATE INDEX "crawl_urls_shop_priority_idx" ON "crawl_urls" USING btree ("shop_id","priority");