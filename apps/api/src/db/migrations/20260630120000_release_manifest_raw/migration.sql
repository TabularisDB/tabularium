-- Canonical raw .tabularium bytes, stored verbatim at ingest so the registry
-- can serve the manifest itself — clients verify sha256(manifest_raw) against
-- the JWS-signed manifest_sha256 and never touch the upstream forge. NULL on
-- releases ingested before this column existed.
ALTER TABLE `releases` ADD `manifest_raw` text;
