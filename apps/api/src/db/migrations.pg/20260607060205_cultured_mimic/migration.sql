CREATE TABLE "email_preferences" (
	"user_id" text PRIMARY KEY,
	"prefs" text NOT NULL,
	"token_nonce" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"email" text PRIMARY KEY,
	"source" text NOT NULL,
	"reason" text,
	"added_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE("email");--> statement-breakpoint
CREATE INDEX "email_suppression_source_idx" ON "email_suppression" ("source");--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "users" u
SET "email" = rc."email"
FROM "root_credentials" rc
WHERE rc."user_id" = u."id" AND u."email" IS NULL;