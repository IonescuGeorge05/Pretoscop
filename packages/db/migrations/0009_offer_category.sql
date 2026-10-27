ALTER TABLE "offers" ADD COLUMN "category_slug" text;--> statement-breakpoint
CREATE INDEX "offers_category_slug_idx" ON "offers" USING btree ("category_slug");