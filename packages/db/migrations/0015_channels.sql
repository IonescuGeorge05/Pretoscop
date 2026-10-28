CREATE TABLE "channel_posts" (
	"channel" text NOT NULL,
	"day" date NOT NULL,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_posts_channel_day_pk" PRIMARY KEY("channel","day")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_label" text,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failures" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_version" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	CONSTRAINT "telegram_links_status_ck" CHECK ("telegram_links"."status" in ('active','blocked'))
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_idx" ON "telegram_link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_links_chat_uq" ON "telegram_links" USING btree ("chat_id");