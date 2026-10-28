CREATE TABLE "extractor_canaries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "extractor_canaries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_key" text NOT NULL,
	"shop_id" bigint NOT NULL,
	"source_id" bigint,
	"url" text NOT NULL,
	"parser_key" text NOT NULL,
	"purpose" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"http_status" smallint,
	"offers" integer DEFAULT 0 NOT NULL,
	"fields" jsonb,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail" text,
	CONSTRAINT "extractor_canaries_status_ck" CHECK ("extractor_canaries"."status" in ('ok','drift','fetch_failed','skipped')),
	CONSTRAINT "extractor_canaries_purpose_ck" CHECK ("extractor_canaries"."purpose" in ('listing','product'))
);
--> statement-breakpoint
ALTER TABLE "extractor_canaries" ADD CONSTRAINT "extractor_canaries_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractor_canaries" ADD CONSTRAINT "extractor_canaries_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extractor_canaries_shop_checked_idx" ON "extractor_canaries" USING btree ("shop_id","checked_at");--> statement-breakpoint
CREATE INDEX "extractor_canaries_run_idx" ON "extractor_canaries" USING btree ("run_key");