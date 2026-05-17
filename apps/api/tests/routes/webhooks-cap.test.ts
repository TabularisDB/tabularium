import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { db } from '../../src/db'
import { auditLog, releaseAssets, releases } from '../../src/db/schema'
import { setSetting } from '../../src/lib/settings'

async function signPayload(secret: string, body: string) {
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(Buffer.from(body))
  return 'sha256=' + hasher.digest('hex')
}

/**
 * When the registry asset size cap is exceeded, the release itself still
 * ingests but the per-asset row is skipped *and* an audit entry is written
 * so operators can trace ingestion gaps.
 */
describe('webhook ingest → asset over cap → audit', () => {
  let server: ReturnType<typeof Bun.serve>
  // 4 bytes > 1 byte cap.
  const BODY = new TextEncoder().encode('big!')

  beforeEach(async () => {
    await clearDb()
    await setSetting('registry.asset_size_cap_bytes', '1')
    server = Bun.serve({ port: 0, fetch: () => new Response(BODY) })
  })

  afterEach(() => {
    server.stop(true)
  })

  it('skips the asset row and emits release.asset_skipped audit entry', async () => {
    const secret = 'x'.repeat(32)
    const user = await makeUser()
    const plugin = await makePlugin(user.id, {
      status: 'approved',
      webhookSecret: secret,
      repoUrl: 'https://github.com/alice/cap-plugin',
    })

    const assetName = 'plugin-linux-x64.zip'
    const assetUrl = `http://localhost:${server.port}/${assetName}`
    const body = JSON.stringify({
      action: 'published',
      release: {
        tag_name: 'v1.0.0',
        assets: [{ name: assetName, browser_download_url: assetUrl }],
      },
      repository: { html_url: plugin.repoUrl },
    })
    const sig = await signPayload(secret, body)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/webhooks/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-event': 'release',
        },
        body,
      }),
    )
    expect(res.status).toBe(200)

    // Drain the background hashing microtask.
    await new Promise((r) => setTimeout(r, 200))

    // Release was ingested.
    const release = await db.query.releases.findFirst({ where: { pluginId: plugin.id } })
    expect(release).toBeTruthy()

    // No release_assets row for the skipped asset.
    const assetRows = await db
      .select()
      .from(releaseAssets)
      .where(eq(releaseAssets.releaseId, release!.id))
    expect(assetRows).toHaveLength(0)

    // Exactly one release.asset_skipped audit entry, matching the asset.
    const allAudit = await db.select().from(auditLog)
    const skipped = allAudit.filter((r) => r.action === 'release.asset_skipped')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].target).toBe(`release:${release!.id}`)
    const meta = JSON.parse(skipped[0].meta ?? '{}') as { url: string; name: string; reason: string }
    expect(meta.url).toBe(assetUrl)
    expect(meta.name).toBe(assetName)
    expect(meta.reason).toMatch(/exceeds.*hash budget/i)
  })
})
