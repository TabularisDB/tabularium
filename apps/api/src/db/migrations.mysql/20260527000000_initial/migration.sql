CREATE TABLE `audit_log` (
	`id` varchar(64) PRIMARY KEY,
	`actor_id` varchar(64),
	`actor_name` varchar(120),
	`action` varchar(80) NOT NULL,
	`target` varchar(200),
	`meta` text,
	`ip` varchar(64),
	`created_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_events` (
	`id` varchar(64) PRIMARY KEY,
	`plugin_id` varchar(64) NOT NULL,
	`version` varchar(80) NOT NULL,
	`platform` varchar(40) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `download_events_plugin_created` UNIQUE INDEX(`plugin_id`,`created_at`,`id`)
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64) NOT NULL,
	`provider_instance_id` varchar(64) NOT NULL,
	`external_id` varchar(120) NOT NULL,
	`username` varchar(120) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` bigint,
	`created_at` bigint NOT NULL,
	CONSTRAINT `identities_instance_external_unique` UNIQUE INDEX(`provider_instance_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `markdown_pages` (
	`slug` varchar(80) NOT NULL,
	`locale` varchar(16) NOT NULL DEFAULT 'en',
	`title` varchar(120) NOT NULL,
	`content` text NOT NULL,
	`published` tinyint NOT NULL DEFAULT 1,
	`path` varchar(200) NOT NULL,
	`nav_order` int,
	`show_in_footer` tinyint NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT PRIMARY KEY(`slug`,`locale`),
	CONSTRAINT `markdown_pages_path_locale` UNIQUE INDEX(`path`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `plugin_request_claims` (
	`request_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT PRIMARY KEY(`request_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_request_votes` (
	`request_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	CONSTRAINT PRIMARY KEY(`request_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_requests` (
	`id` varchar(64) PRIMARY KEY,
	`slug` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500) NOT NULL,
	`requester_id` varchar(64) NOT NULL,
	`upvotes` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	CONSTRAINT `slug_unique` UNIQUE INDEX(`slug`)
);
--> statement-breakpoint
CREATE TABLE `plugin_transfers` (
	`id` varchar(64) PRIMARY KEY,
	`plugin_id` varchar(80) NOT NULL,
	`from_user_id` varchar(64) NOT NULL,
	`to_user_id` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`message` varchar(500),
	`created_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`responded_at` bigint
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` varchar(80) PRIMARY KEY,
	`owner_id` varchar(64) NOT NULL,
	`provider_instance_id` varchar(64),
	`name` varchar(120) NOT NULL,
	`description` varchar(500) NOT NULL,
	`author` varchar(500) NOT NULL,
	`repo_url` varchar(500) NOT NULL,
	`homepage` varchar(500) NOT NULL,
	`latest_version` varchar(40),
	`webhook_secret` varchar(128) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'approved',
	`rejection_reason` varchar(500),
	`category` varchar(40),
	`tags` text,
	`license` varchar(40),
	`icon_url` varchar(500),
	`screenshots` text,
	`readme` text,
	`documentation_url` varchar(500),
	`support_email` varchar(254),
	`issues_url` varchar(500),
	`manifest_fetched_at` bigint,
	`manifest_version` varchar(80),
	`featured` tinyint NOT NULL DEFAULT 0,
	`featured_order` int,
	`downloads` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_instances` (
	`id` varchar(64) PRIMARY KEY,
	`kind` varchar(16) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`base_url` varchar(500) NOT NULL,
	`client_id` varchar(500) NOT NULL,
	`client_secret` text NOT NULL,
	`logo_url` varchar(500),
	`enabled` tinyint NOT NULL DEFAULT 1,
	`created_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE `release_assets` (
	`id` varchar(64) PRIMARY KEY,
	`release_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`size` bigint NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`content_type` varchar(120),
	`arch` varchar(40),
	`os` varchar(40),
	`attestation_bundle` text,
	`created_at` bigint NOT NULL,
	CONSTRAINT `release_assets_release_name` UNIQUE INDEX(`release_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` varchar(64) PRIMARY KEY,
	`plugin_id` varchar(80) NOT NULL,
	`version` varchar(40) NOT NULL,
	`min_runtime_version` varchar(40),
	`assets` text NOT NULL,
	`manifest_sha256` varchar(64),
	`created_at` bigint NOT NULL,
	CONSTRAINT `releases_plugin_version` UNIQUE INDEX(`plugin_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `root_credentials` (
	`user_id` varchar(64) PRIMARY KEY,
	`email` varchar(320) NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `email_unique` UNIQUE INDEX(`email`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`revoked_at` bigint,
	`user_agent` varchar(500),
	`ip` varchar(64)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(120) PRIMARY KEY,
	`value` text NOT NULL,
	`encrypted` tinyint NOT NULL DEFAULT 0,
	`updated_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(64) PRIMARY KEY,
	`display_name` varchar(120) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'user',
	`created_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_created_idx` ON `audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target`);--> statement-breakpoint
CREATE INDEX `identities_user_id_idx` ON `identities` (`user_id`);--> statement-breakpoint
CREATE INDEX `plugin_transfers_to_user_status_idx` ON `plugin_transfers` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `plugin_transfers_from_user_status_idx` ON `plugin_transfers` (`from_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `plugins_status_idx` ON `plugins` (`status`);--> statement-breakpoint
CREATE INDEX `plugins_owner_id_idx` ON `plugins` (`owner_id`);--> statement-breakpoint
CREATE INDEX `plugins_provider_instance_id_idx` ON `plugins` (`provider_instance_id`);--> statement-breakpoint
CREATE INDEX `plugins_category_idx` ON `plugins` (`category`);--> statement-breakpoint
CREATE INDEX `plugins_updated_at_idx` ON `plugins` (`updated_at`);--> statement-breakpoint
CREATE INDEX `plugins_featured_idx` ON `plugins` (`featured`,`featured_order`);--> statement-breakpoint
CREATE INDEX `releases_plugin_created_idx` ON `releases` (`plugin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_revoked_idx` ON `sessions` (`revoked_at`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_id_users_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `download_events` ADD CONSTRAINT `download_events_plugin_id_plugins_id_fkey` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `identities` ADD CONSTRAINT `identities_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `identities` ADD CONSTRAINT `identities_provider_instance_id_provider_instances_id_fkey` FOREIGN KEY (`provider_instance_id`) REFERENCES `provider_instances`(`id`);--> statement-breakpoint
ALTER TABLE `plugin_request_claims` ADD CONSTRAINT `plugin_request_claims_request_id_plugin_requests_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `plugin_request_claims` ADD CONSTRAINT `plugin_request_claims_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `plugin_request_votes` ADD CONSTRAINT `plugin_request_votes_request_id_plugin_requests_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`);--> statement-breakpoint
ALTER TABLE `plugin_request_votes` ADD CONSTRAINT `plugin_request_votes_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`);--> statement-breakpoint
ALTER TABLE `plugin_requests` ADD CONSTRAINT `plugin_requests_requester_id_users_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`);--> statement-breakpoint
ALTER TABLE `plugin_transfers` ADD CONSTRAINT `plugin_transfers_plugin_id_plugins_id_fkey` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `plugin_transfers` ADD CONSTRAINT `plugin_transfers_from_user_id_users_id_fkey` FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `plugin_transfers` ADD CONSTRAINT `plugin_transfers_to_user_id_users_id_fkey` FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `plugins` ADD CONSTRAINT `plugins_owner_id_users_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`);--> statement-breakpoint
ALTER TABLE `plugins` ADD CONSTRAINT `plugins_provider_instance_id_provider_instances_id_fkey` FOREIGN KEY (`provider_instance_id`) REFERENCES `provider_instances`(`id`);--> statement-breakpoint
ALTER TABLE `release_assets` ADD CONSTRAINT `release_assets_release_id_releases_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `releases` ADD CONSTRAINT `releases_plugin_id_plugins_id_fkey` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`);--> statement-breakpoint
ALTER TABLE `root_credentials` ADD CONSTRAINT `root_credentials_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;