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
	`refresh_token` text,
	`access_token_expires_at` integer,
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
CREATE TABLE `release_assets` (
	`id` text PRIMARY KEY,
	`release_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`content_type` text,
	`arch` text,
	`os` text,
	`attestation_bundle` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_release_assets_release_id_releases_id_fk` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`min_runtime_version` text,
	`assets` text NOT NULL,
	`manifest_sha256` text,
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
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	`user_agent` text,
	`ip` text,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
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
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_created_idx` ON `audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target`);--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_plugin_created` ON `download_events` (`plugin_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `identities_instance_external_unique` ON `identities` (`provider_instance_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `identities_user_id_idx` ON `identities` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_pages_path_locale` ON `markdown_pages` (`path`,`locale`);--> statement-breakpoint
CREATE INDEX `plugin_transfers_to_user_status_idx` ON `plugin_transfers` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `plugin_transfers_from_user_status_idx` ON `plugin_transfers` (`from_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `plugins_status_idx` ON `plugins` (`status`);--> statement-breakpoint
CREATE INDEX `plugins_owner_id_idx` ON `plugins` (`owner_id`);--> statement-breakpoint
CREATE INDEX `plugins_provider_instance_id_idx` ON `plugins` (`provider_instance_id`);--> statement-breakpoint
CREATE INDEX `plugins_category_idx` ON `plugins` (`category`);--> statement-breakpoint
CREATE INDEX `plugins_updated_at_idx` ON `plugins` (`updated_at`);--> statement-breakpoint
CREATE INDEX `plugins_featured_idx` ON `plugins` (`featured`,`featured_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_assets_release_name` ON `release_assets` (`release_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_plugin_version` ON `releases` (`plugin_id`,`version`);--> statement-breakpoint
CREATE INDEX `releases_plugin_created_idx` ON `releases` (`plugin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_revoked_idx` ON `sessions` (`revoked_at`);
--> statement-breakpoint
-- Full-text search: FTS5 contentless virtual table mirroring plugins.
CREATE VIRTUAL TABLE `plugins_fts` USING fts5(
  name, id, description, tags,
  content='plugins',
  content_rowid='rowid',
  tokenize='porter unicode61'
);--> statement-breakpoint
CREATE TRIGGER `plugins_fts_ai` AFTER INSERT ON `plugins` BEGIN
  INSERT INTO plugins_fts(rowid, name, id, description, tags)
  VALUES (new.rowid, new.name, new.id, new.description, new.tags);
END;--> statement-breakpoint
CREATE TRIGGER `plugins_fts_ad` AFTER DELETE ON `plugins` BEGIN
  INSERT INTO plugins_fts(plugins_fts, rowid, name, id, description, tags)
  VALUES ('delete', old.rowid, old.name, old.id, old.description, old.tags);
END;--> statement-breakpoint
CREATE TRIGGER `plugins_fts_au` AFTER UPDATE ON `plugins` BEGIN
  INSERT INTO plugins_fts(plugins_fts, rowid, name, id, description, tags)
  VALUES ('delete', old.rowid, old.name, old.id, old.description, old.tags);
  INSERT INTO plugins_fts(rowid, name, id, description, tags)
  VALUES (new.rowid, new.name, new.id, new.description, new.tags);
END;
