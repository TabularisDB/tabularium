CREATE TABLE "admin_tokens" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text,
	"expires_at" bigint,
	"last_used_at" bigint,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE INDEX "admin_tokens_user_idx" ON "admin_tokens" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_tokens_hash_uniq" ON "admin_tokens" ("token_hash");--> statement-breakpoint
ALTER TABLE "admin_tokens" ADD CONSTRAINT "admin_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;