CREATE TABLE "contact_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contact_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"email" text,
	"name" text,
	"subject_url" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"session_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	CONSTRAINT "contact_requests_kind_ck" CHECK ("contact_requests"."kind" in ('general','price_error','shop_objection','illegal_content','privacy','merchant','press')),
	CONSTRAINT "contact_requests_status_ck" CHECK ("contact_requests"."status" in ('new','in_progress','resolved','rejected'))
);
--> statement-breakpoint
CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status","created_at");