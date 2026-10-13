-- Bounty lifecycle for community requests. See sqlite migration for rationale.
ALTER TABLE "plugin_requests" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
UPDATE "plugin_requests" SET "status" = 'approved';
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "rejection_reason" text;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "reviewed_by" text;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "reviewed_at" bigint;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "fulfilled_plugin_id" text;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "fulfilled_at" bigint;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "bounty" text;
--> statement-breakpoint
ALTER TABLE "plugin_requests" ADD COLUMN "updated_at" bigint;
--> statement-breakpoint
ALTER TABLE "plugin_request_claims" ADD COLUMN "repo_url" text;
--> statement-breakpoint
ALTER TABLE "plugin_request_claims" ADD COLUMN "scaffolded_at" bigint;
--> statement-breakpoint
CREATE INDEX "plugin_requests_status_idx" ON "plugin_requests" ("status");
