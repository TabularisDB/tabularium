-- Bounty lifecycle for community requests. See sqlite migration for rationale.
ALTER TABLE `plugin_requests` ADD `status` varchar(16) DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
UPDATE `plugin_requests` SET `status` = 'approved';
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `rejection_reason` varchar(500);
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `reviewed_by` varchar(64);
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `reviewed_at` bigint;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `fulfilled_plugin_id` varchar(80);
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `fulfilled_at` bigint;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `bounty` text;
--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD `updated_at` bigint;
--> statement-breakpoint
ALTER TABLE `plugin_request_claims` ADD `repo_url` varchar(500);
--> statement-breakpoint
ALTER TABLE `plugin_request_claims` ADD `scaffolded_at` bigint;
--> statement-breakpoint
CREATE INDEX `plugin_requests_status_idx` ON `plugin_requests` (`status`);
