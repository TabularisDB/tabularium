CREATE TABLE "publisher_tokens" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" bigint,
	"last_used_at" bigint,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE INDEX "publisher_tokens_user_idx" ON "publisher_tokens" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_tokens_hash_uniq" ON "publisher_tokens" ("token_hash");--> statement-breakpoint
ALTER TABLE "publisher_tokens" ADD CONSTRAINT "publisher_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;