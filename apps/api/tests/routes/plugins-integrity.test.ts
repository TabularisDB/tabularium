import { describe, it, expect, beforeEach } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, makePlugin, buildApp } from '../helpers'
import { db } from '../../src/db'
import { releases, releaseAssets } from '../../src/db/schema'
import { ensureSigningKey } from '../../src/lib/registry-key'

describe('GET /api/plugins/:slug — integrity field', () => {
  beforeEach(clearDb)

  it('includes integrity.jws + integrity.assets when release_assets rows exist', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { status: 'approved', latestVersion: '1.0.0' })
    const releaseId = ulid()
    await db.insert(releases).values({ id: releaseId, pluginId: plugin.id, version: '1.0.0', assets: '{}', manifestSha256: 'e'.repeat(64) })
    await db
      .insert(releaseAssets)
      .values({ id: ulid(), releaseId, name: 'p.zip', url: 'https://e/p.zip', size: 100, sha256: 'c'.repeat(64) })

    const app = await buildApp()
    const res = await app.handle(new Request(`http://localhost/api/plugins/${plugin.id}`))
    const body = (await res.json()) as {
      releases: Array<{ integrity: { jws: string; assets: Array<{ name: string }> } | null }>
    }
    expect(body.releases[0].integrity?.jws.split('.')).toHaveLength(3)
    expect(body.releases[0].integrity?.assets[0].name).toBe('p.zip')
  })

  it('integrity is null when no release_assets rows yet (legacy release)', async () => {
    await ensureSigningKey()
    const user = await makeUser()
    const plugin = await makePlugin(user.id, { status: 'approved', latestVersion: '0.9.0' })
    await db.insert(releases).values({ id: ulid(), pluginId: plugin.id, version: '0.9.0', assets: '{}' })
    const app = await buildApp()
    const res = await app.handle(new Request(`http://localhost/api/plugins/${plugin.id}`))
    const body = (await res.json()) as { releases: Array<{ integrity: unknown }> }
    expect(body.releases[0].integrity).toBeNull()
  })
})
