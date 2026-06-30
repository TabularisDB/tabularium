-- Canonical raw .tabularium bytes. See sqlite migration for rationale.
ALTER TABLE `releases` ADD `manifest_raw` text;
