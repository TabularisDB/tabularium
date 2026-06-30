-- Canonical raw .tabularium bytes. See sqlite migration for rationale.
ALTER TABLE "releases" ADD COLUMN "manifest_raw" text;
