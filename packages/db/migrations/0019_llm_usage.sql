CREATE TABLE "llm_results" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"input_hash" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"offer_id" bigint,
	"product_id" bigint,
	"subject_key" text,
	"ok" boolean NOT NULL,
	"output" jsonb,
	"error" text,
	"attempts" smallint DEFAULT 1 NOT NULL,
	"usage_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_results_kind_ck" CHECK ("llm_results"."kind" in ('pair','attributes','category'))
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"batch_id" text,
	"custom_id" text,
	"input_hash" text NOT NULL,
	"subject" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_5m_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_1h_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"eur_per_usd" numeric(10, 6) NOT NULL,
	"reserved_usd_nanos" bigint NOT NULL,
	"reserved_eur_nanos" bigint NOT NULL,
	"cost_usd_nanos" bigint DEFAULT 0 NOT NULL,
	"cost_eur_nanos" bigint DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "llm_usage_status_ck" CHECK ("llm_usage"."status" in ('reserved','billed','released','estimated')),
	CONSTRAINT "llm_usage_mode_ck" CHECK ("llm_usage"."mode" in ('sync','batch')),
	CONSTRAINT "llm_usage_purpose_ck" CHECK ("llm_usage"."purpose" in ('match.verify','attributes.extract','category.suggest','eval'))
);
--> statement-breakpoint
ALTER TABLE "llm_results" ADD CONSTRAINT "llm_results_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_results" ADD CONSTRAINT "llm_results_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_results" ADD CONSTRAINT "llm_results_usage_id_llm_usage_id_fk" FOREIGN KEY ("usage_id") REFERENCES "public"."llm_usage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_results_input_hash_uq" ON "llm_results" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "llm_results_offer_idx" ON "llm_results" USING btree ("offer_id","product_id");--> statement-breakpoint
CREATE INDEX "llm_results_subject_idx" ON "llm_results" USING btree ("kind","subject_key");--> statement-breakpoint
CREATE INDEX "llm_usage_created_idx" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_reserved_idx" ON "llm_usage" USING btree ("batch_id") WHERE "llm_usage"."status" = 'reserved';--> statement-breakpoint
CREATE INDEX "llm_usage_input_hash_idx" ON "llm_usage" USING btree ("input_hash");