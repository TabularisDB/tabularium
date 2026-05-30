ALTER TABLE `plugins` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `plugins` ADD `verified_by` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `plugins_verified_at_idx` ON `plugins` (`verified_at`);