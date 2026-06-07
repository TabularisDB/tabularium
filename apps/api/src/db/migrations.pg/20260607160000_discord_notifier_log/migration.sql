-- Discord-notifier plugin audit table: pl_discord_notifier__webhook_log.
-- See sqlite migration for rationale.
CREATE TABLE "pl_discord_notifier__webhook_log" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"error" text,
	"sent_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "pl_discord_notifier__webhook_log_sent_idx" ON "pl_discord_notifier__webhook_log" ("sent_at");--> statement-breakpoint
CREATE INDEX "pl_discord_notifier__webhook_log_event_sent_idx" ON "pl_discord_notifier__webhook_log" ("event","sent_at");
