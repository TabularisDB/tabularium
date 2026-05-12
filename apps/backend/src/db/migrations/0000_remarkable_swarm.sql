CREATE TABLE `challenges` (
	`token` text PRIMARY KEY NOT NULL,
	`repo_url` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plugin_request_votes` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`request_id`, `user_id`),
	FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plugin_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`requester_id` text NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_requests_slug_unique` ON `plugin_requests` (`slug`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author` text NOT NULL,
	`repo_url` text NOT NULL,
	`homepage` text NOT NULL,
	`latest_version` text,
	`webhook_secret` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`min_tabularis_version` text,
	`assets` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_plugin_version` ON `releases` (`plugin_id`,`version`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_instance_url` text,
	`external_id` text NOT NULL,
	`username` text NOT NULL,
	`access_token` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_unique` ON `users` (`provider`,`provider_instance_url`,`external_id`);