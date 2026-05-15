CREATE TABLE "download_events" (
	"id" text PRIMARY KEY,
	"plugin_id" text NOT NULL,
	"version" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "download_events_plugin_created" ON "download_events" ("plugin_id","created_at","id");--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_plugin_id_plugins_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE CASCADE;