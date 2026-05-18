CREATE TABLE IF NOT EXISTS "release_assets" (
	"id" text PRIMARY KEY,
	"release_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text,
	"arch" text,
	"os" text,
	"attestation_bundle" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_assets_release_name" ON "release_assets" ("release_id","name");--> statement-breakpoint
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_release_id_releases_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE;