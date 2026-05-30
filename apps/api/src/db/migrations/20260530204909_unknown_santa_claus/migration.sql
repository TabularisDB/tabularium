ALTER TABLE `releases` ADD `yanked_at` integer;--> statement-breakpoint
ALTER TABLE `releases` ADD `yanked_by` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `releases` ADD `yank_reason` text;--> statement-breakpoint
CREATE INDEX `releases_yanked_at_idx` ON `releases` (`yanked_at`);