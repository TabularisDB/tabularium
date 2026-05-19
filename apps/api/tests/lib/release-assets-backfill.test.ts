import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, makePlugin } from '../helpers'
import { db } from '../../src/db'
import { releases, releaseAssets } from '../../src/db/schema'
import { backfillReleaseAssets } from '../../src/lib/release-assets-backfill'

let server: ReturnType<typeof Bun.serve>
const FIXTURE = new TextEncoder().encode('legacy-body')

describe('backfillReleaseAssets', () => {
  beforeEach(async () => {
    await clearDb()
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE) })
  })
  afterEach(() => server.stop(true))

  it('inserts release_assets rows for legacy releases (only JSON blob populated)', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    const url = `http://localhost:${server.port}/legacy.zip`
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '0.9.0',
      assets: JSON.stringify({ 'linux-x64': { url } }),
    })
    const summary = await backfillReleaseAssets()
    expect(summary.processed).toBe(1)
    const rows = await db.select().from(releaseAssets)
    expect(rows).toHaveLength(1)
    expect(rows[0].size).toBe(FIXTURE.byteLength)
  })

  it('is idempotent — running twice does not duplicate', async () => {
    const user = await makeUser()
    const plugin = await makePlugin(user.id)
    await db.insert(releases).values({
      id: ulid(),
      pluginId: plugin.id,
      version: '0.9.0',
      assets: JSON.stringify({ 'linux-x64': { url: `http://localhost:${server.port}/x.zip` } }),
    })
    await backfillReleaseAssets()
    await backfillReleaseAssets()
    const rows = await db.select().from(releaseAssets)
    expect(rows).toHaveLength(1)
  })
})
