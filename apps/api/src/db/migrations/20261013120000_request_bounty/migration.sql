-- Bounty lifecycle for community requests.
-- `status`: new requests wait in `pending` until an admin reviews them;
-- `approved` ones are public bounties, `fulfilled` ones are linked to the
-- plugin that shipped them. Requests created before review existed were
-- already public, so they start out approved.
ALTER TABLE `plugin_requests` ADD `status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
UPDATE `plugin_requests` SET `status` = 'approved';
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `rejection_reason` text;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `reviewed_by` text;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `reviewed_at` integer;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `fulfilled_plugin_id` text;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `fulfilled_at` integer;
--> statement-breakpoint
-- Bounty board metadata as JSON (tagline, scope, difficulty, board status…).
ALTER TABLE `plugin_requests` ADD `bounty` text;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `updated_at` integer;
--> statement-breakpoint
-- Repository scaffolded for a claim by POST /api/requests/:id/scaffold.
ALTER TABLE `plugin_request_claims` ADD `repo_url` text;
--> statement-breakpoint
ALTER TABLE `plugin_request_claims` ADD `scaffolded_at` integer;
--> statement-breakpoint
CREATE INDEX `plugin_requests_status_idx` ON `plugin_requests` (`status`);
