CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_hash" text,
	"path" text,
	"referrer_host" text
);
--> statement-breakpoint
CREATE INDEX "events_ts_brin" ON "events" USING brin ("ts");--> statement-breakpoint
CREATE INDEX "events_name_ts_idx" ON "events" USING btree ("name","ts");