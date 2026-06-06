CREATE TABLE "email_log" (
	"id" text PRIMARY KEY,
	"user_id" text,
	"trigger" text NOT NULL,
	"template" text NOT NULL,
	"locale" text NOT NULL,
	"to_address" text NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"provider" text NOT NULL,
	"provider_mid" text,
	"status" text NOT NULL,
	"error" text,
	"sent_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_log_user_sent_idx" ON "email_log" ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "email_log_mid_idx" ON "email_log" ("provider_mid");--> statement-breakpoint
CREATE INDEX "email_log_trigger_idx" ON "email_log" ("trigger","sent_at");--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;