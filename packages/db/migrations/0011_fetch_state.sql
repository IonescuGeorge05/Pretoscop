CREATE TABLE "fetch_domain_daily" (
	"host" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fetch_domain_daily_host_day_pk" PRIMARY KEY("host","day")
);
--> statement-breakpoint
CREATE TABLE "fetch_domain_state" (
	"host" text PRIMARY KEY NOT NULL,
	"next_slot_at" timestamp with time zone DEFAULT '-infinity' NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"pause_set_at" timestamp with time zone,
	"pause_source" text,
	"pause_block_reason" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_robots_cache" (
	"origin" text PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" integer NOT NULL,
	"outcome" text NOT NULL,
	"body" text,
	"etag" text,
	"last_modified" text,
	"final_url" text,
	"truncated" boolean DEFAULT false NOT NULL,
	"html_body" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"detail" text,
	"channel" text
);
--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "robots_ignored_groups" text[];--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "source_id" bigint;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "wait_ms" integer;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "attempt" smallint;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "hop" smallint;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "not_modified" boolean;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "request_log" ADD COLUMN "block_detail" text;