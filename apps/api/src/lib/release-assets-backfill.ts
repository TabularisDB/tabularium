import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { db } from '$db'
import { releases, releaseAssets } from '$db/schema'
import { hashAsset, parseAssets } from '$lib/asset'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'release-assets-backfill' })

const PAGE_SIZE = 50

export type BackfillSummary = {
  processed: number
  skipped: number
  errors: Array<{ releaseId: string; error: string }>
}

export type BackfillOptions = {
  /**
   * When true (default) skip URLs that already have a matching (release_id, name)
   * row in release_assets. The (release_id, name) unique index also guards
   * against duplicate inserts under concurrent runs via onConflictDoNothing.
   */
  onlyMissing?: boolean
}

/**
 * Idempotent backfill of release_assets for legacy releases whose
 * `releases.assets` JSON blob is populated but have no companion
 * release_assets rows yet.
 *
 * Idempotency is guaranteed by the unique (release_id, name) index plus
 * onConflictDoNothing — we never refresh existing rows.
 *
 * Legacy `releases.assets` is keyed by platform (e.g. `linux-x64`). The
 * original filename isn't recoverable from that blob, so we use the platform
 * key as `release_assets.name`. Fresh ingest paths (Task 10) will continue
 * to write the true filename and won't collide because the unique index is
 * on (release_id, name).
 */
export async function backfillReleaseAssets(
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const onlyMissing = options.onlyMissing ?? true
  const summary: BackfillSummary = { processed: 0, skipped: 0, errors: [] }

  let offset = 0
  while (true) {
    const page = await db.select().from(releases).limit(PAGE_SIZE).offset(offset)
    if (page.length === 0) break
    offset += page.length

    for (const release of page) {
      try {
        const assets = parseAssets(release.assets)
        const entries = Object.entries(assets)
        if (entries.length === 0) {
          summary.skipped += 1
          continue
        }

        let existing: Array<{ name: string }> = []
        if (onlyMissing) {
          existing = await db
            .select({ name: releaseAssets.name })
            .from(releaseAssets)
            .where(eq(releaseAssets.releaseId, release.id))
        }
        const have = new Set(existing.map((r) => r.name))

        let didInsert = false
        for (const [platform, entry] of entries) {
          // Use platform key as name — legacy JSON doesn't preserve the
          // original filename.
          const name = platform
          if (onlyMissing && have.has(name)) {
            continue
          }
          const result = await hashAsset(entry.url)
          if (!result.sha256 || typeof result.size !== 'number') {
            summary.errors.push({
              releaseId: release.id,
              error: result.reason ?? 'hash failed',
            })
            continue
          }
          await db
            .insert(releaseAssets)
            .values({
              id: ulid(),
              releaseId: release.id,
              name,
              url: entry.url,
              size: result.size,
              sha256: result.sha256,
            })
            .onConflictDoNothing({
              target: [releaseAssets.releaseId, releaseAssets.name],
            })
          didInsert = true
        }

        if (didInsert) summary.processed += 1
        else summary.skipped += 1
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        summary.errors.push({ releaseId: release.id, error: message })
        log.warn({ err, releaseId: release.id }, 'backfill release failed')
      }
    }

    if (page.length < PAGE_SIZE) break
  }

  log.info(
    {
      processed: summary.processed,
      skipped: summary.skipped,
      errorCount: summary.errors.length,
    },
    'release_assets backfill complete',
  )
  return summary
}
