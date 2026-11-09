CREATE TABLE "product_history_dirty" (
	"product_id" bigint PRIMARY KEY NOT NULL,
	"from_day" date NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "review_hold" text;--> statement-breakpoint
ALTER TABLE "price_events" ADD COLUMN "total_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_merges" ADD COLUMN "moved_gtins" text[];--> statement-breakpoint
ALTER TABLE "product_merges" ADD COLUMN "moved_aliases" jsonb;