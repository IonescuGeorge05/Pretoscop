CREATE TABLE "alert_sends" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_sends_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"alert_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"product_id" bigint NOT NULL,
	"offer_id" bigint NOT NULL,
	"shop_id" bigint,
	"price" numeric(12, 2) NOT NULL,
	"shipping_cost" numeric(12, 2),
	"total" numeric(12, 2) NOT NULL,
	"reference_total" numeric(12, 2),
	"reason" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"provider_message_id" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"prev_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "alert_sends_status_ck" CHECK ("alert_sends"."status" in ('queued','sending','sent','failed','skipped')),
	CONSTRAINT "alert_sends_channel_ck" CHECK ("alert_sends"."channel" in ('email','push','telegram'))
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"product_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"target_price" numeric(12, 2),
	"any_variant" boolean DEFAULT false NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paused_reason" text,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_ip_hash" text,
	"consent_text_version" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirm_ip_hash" text,
	"confirm_method" text,
	"confirmation_sent_at" timestamp with time zone,
	"baseline_total" numeric(12, 2),
	"armed" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone,
	"last_notified_total" numeric(12, 2),
	"last_notified_offer_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_kind_ck" CHECK ("alerts"."kind" in ('below','any_drop')),
	CONSTRAINT "alerts_channel_ck" CHECK ("alerts"."channel" in ('email','push','telegram')),
	CONSTRAINT "alerts_status_ck" CHECK ("alerts"."status" in ('pending','active','paused')),
	CONSTRAINT "alerts_target_ck" CHECK (("alerts"."kind" <> 'below' OR "alerts"."target_price" IS NOT NULL) AND ("alerts"."target_price" IS NULL OR "alerts"."target_price" > 0)),
	CONSTRAINT "alerts_confirm_method_ck" CHECK ("alerts"."confirm_method" IS NULL OR "alerts"."confirm_method" in ('email_link','session','telegram'))
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "consent_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text,
	"email_hash" text,
	"purpose" text NOT NULL,
	"alert_id" bigint,
	"product_id" bigint,
	"text_version" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"given_ip_hash" text,
	"confirmed_at" timestamp with time zone,
	"confirm_ip_hash" text,
	"confirm_method" text,
	"withdrawn_at" timestamp with time zone,
	"withdraw_method" text,
	CONSTRAINT "consent_records_purpose_ck" CHECK ("consent_records"."purpose" in ('alert_email','alert_push','alert_telegram'))
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_reason_ck" CHECK ("email_suppressions"."reason" in ('unsubscribed','complaint','bounce','deleted'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retention_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_sends" ADD CONSTRAINT "alert_sends_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_sends" ADD CONSTRAINT "alert_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_sends_pending_idx" ON "alert_sends" USING btree ("status","not_before") WHERE "alert_sends"."status" in ('queued','sending');--> statement-breakpoint
CREATE INDEX "alert_sends_alert_idx" ON "alert_sends" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_sends_user_idx" ON "alert_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_sends_created_idx" ON "alert_sends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "alerts_status_product_idx" ON "alerts" USING btree ("status","product_id");--> statement-breakpoint
CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_user_product_channel_uq" ON "alerts" USING btree ("user_id","product_id","channel") WHERE "alerts"."status" <> 'pending';--> statement-breakpoint
CREATE INDEX "consent_records_email_hash_idx" ON "consent_records" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "consent_records_user_idx" ON "consent_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_records_alert_idx" ON "consent_records" USING btree ("alert_id");