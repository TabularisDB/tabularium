CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY,
	`actor_id` text,
	`actor_name` text,
	`action` text NOT NULL,
	`target` text,
	`meta` text,
	`ip` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_audit_log_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `download_events` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_download_events_plugin_id_plugins_id_fk` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`provider_instance_id` text NOT NULL,
	`external_id` text NOT NULL,
	`username` text NOT NULL,
	`access_token` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_identities_provider_instance_id_provider_instances_id_fk` FOREIGN KEY (`provider_instance_id`) REFERENCES `provider_instances`(`id`)
);
--> statement-breakpoint
CREATE TABLE `markdown_pages` (
	`slug` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`path` text NOT NULL,
	`nav_order` integer,
	`show_in_footer` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `markdown_pages_pk` PRIMARY KEY(`slug`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `plugin_request_claims` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `plugin_request_claims_pk` PRIMARY KEY(`request_id`, `user_id`),
	CONSTRAINT `fk_plugin_request_claims_request_id_plugin_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plugin_request_claims_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plugin_request_votes` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `plugin_request_votes_pk` PRIMARY KEY(`request_id`, `user_id`),
	CONSTRAINT `fk_plugin_request_votes_request_id_plugin_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`),
	CONSTRAINT `fk_plugin_request_votes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_requests` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`requester_id` text NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_plugin_requests_requester_id_users_id_fk` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_transfers` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`responded_at` integer,
	CONSTRAINT `fk_plugin_transfers_plugin_id_plugins_id_fk` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plugin_transfers_from_user_id_users_id_fk` FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plugin_transfers_to_user_id_users_id_fk` FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY,
	`owner_id` text NOT NULL,
	`provider_instance_id` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`repo_url` text NOT NULL,
	`homepage` text NOT NULL,
	`latest_version` text,
	`webhook_secret` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`rejection_reason` text,
	`category` text,
	`tags` text,
	`license` text,
	`icon_url` text,
	`screenshots` text,
	`readme` text,
	`documentation_url` text,
	`support_email` text,
	`issues_url` text,
	`manifest_fetched_at` integer,
	`manifest_version` text,
	`featured` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`downloads` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_plugins_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_plugins_provider_instance_id_provider_instances_id_fk` FOREIGN KEY (`provider_instance_id`) REFERENCES `provider_instances`(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_instances` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`base_url` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`logo_url` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`min_runtime_version` text,
	`assets` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_releases_plugin_id_plugins_id_fk` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`)
);
--> statement-breakpoint
CREATE TABLE `root_credentials` (
	`user_id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_root_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_plugin_created` ON `download_events` (`plugin_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identities_instance_external_unique` ON `identities` (`provider_instance_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_pages_path_locale` ON `markdown_pages` (`path`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_plugin_version` ON `releases` (`plugin_id`,`version`);