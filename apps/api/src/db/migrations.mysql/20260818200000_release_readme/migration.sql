-- Per-release README markdown. See sqlite migration for rationale.
ALTER TABLE `releases` ADD `readme` text;
