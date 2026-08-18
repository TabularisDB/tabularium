-- Per-release README markdown. See sqlite migration for rationale.
ALTER TABLE "releases" ADD COLUMN "readme" text;
